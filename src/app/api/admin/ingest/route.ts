/**
 * POST /api/admin/ingest
 *
 * Body: { anilistId, chapterNumberingSource, totalChapters, wikiSubdomain, autoPublish }
 *
 * Flow:
 * 1. Fetch/create Media from AniList
 * 2. Upsert full character cast from AniList with image and aliases
 * 3. For each character: smart Fandom wikitext fetch → Gemini parse → Name Resolution → DraftIngestion
 * 4. If autoPublish is true and no unresolved names: immediately publish to active tables!
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchMediaDetail } from "@/lib/anilist";
import { saveMediaRelations } from "@/lib/media-relations";
import { fetchCharacterWikitextSmart, fetchFandomCategoryCharacters, isValidWikiTarget } from "@/lib/fandom";
import { parseCharacterWikitext, type GeminiParsedCharacter } from "@/lib/gemini";
import { resolveNames, resolveCharacterName, resolveFactionName } from "@/lib/name-resolution";
import { validateTemporalBounds } from "@/lib/temporal";
import { shouldMergeCharacters, canonicalizeName } from "@/lib/name-dedupe";
import { isBrokenImageUrl } from "@/lib/auto-sync";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { anilistId, chapterNumberingSource, totalChapters, wikiSubdomain, autoPublish } = body;

    if (!anilistId || !chapterNumberingSource || !totalChapters || !wikiSubdomain) {
      return NextResponse.json(
        { error: "Missing required fields: anilistId, chapterNumberingSource, totalChapters, wikiSubdomain" },
        { status: 400 },
      );
    }

    const parsedAnilistId = Number(anilistId);
    const parsedTotalChapters = parseInt(String(totalChapters), 10);
    if (!Number.isInteger(parsedAnilistId) || parsedAnilistId <= 0 || !Number.isInteger(parsedTotalChapters) || parsedTotalChapters <= 0) {
      return NextResponse.json(
        { error: "anilistId and totalChapters must be positive integers" },
        { status: 400 },
      );
    }

    if (typeof wikiSubdomain !== "string" || !isValidWikiTarget(wikiSubdomain)) {
      return NextResponse.json(
        { error: "Invalid wikiSubdomain format (use alphanumeric/hyphens only)" },
        { status: 400 },
      );
    }

    // 1. Fetch from AniList
    const anilistData = await fetchMediaDetail(parsedAnilistId);

    // 2. Upsert Media
    let media = await prisma.media.findUnique({ where: { anilistId: parsedAnilistId } });
    if (!media) {
      media = await prisma.media.create({
        data: {
          anilistId: parsedAnilistId,
          title: anilistData.title,
          type: anilistData.format,
          coverImage: anilistData.coverImage,
          totalChapters: parsedTotalChapters,
          chapterNumberingSource,
          countryOfOrigin: anilistData.countryOfOrigin,
        },
      });
    }

    // Series links (prequel/sequel) — stored even before the related series
    // is ingested so the UI can show the connection.
    if (anilistData.relations.length > 0) {
      await saveMediaRelations(media.id, anilistData.relations);
    }

    // 3. Upsert characters from AniList and merge Fandom Category:Characters
    const castList: Array<{
      name: string;
      aliases: string[];
      imageUrl: string;
      role?: string;
    }> = anilistData.characters.map((c) => ({
      name: c.name,
      aliases: [...(c.aliases || [])],
      imageUrl: c.imageUrl,
      role: c.role,
    }));

    if (wikiSubdomain) {
      try {
        const fandomChars = await fetchFandomCategoryCharacters(wikiSubdomain, 40);
        for (const fc of fandomChars) {
          const matchIndex = castList.findIndex((c) =>
            shouldMergeCharacters(c.name, fc.name) !== null ||
            canonicalizeName(c.name) === canonicalizeName(fc.name)
          );
          if (matchIndex >= 0) {
            const matched = castList[matchIndex];
            if (isBrokenImageUrl(matched.imageUrl) && fc.imageUrl) {
              matched.imageUrl = fc.imageUrl;
            }
            if (!matched.aliases.includes(fc.name)) {
              matched.aliases.push(fc.name);
            }
          } else {
            castList.push({
              name: fc.name,
              aliases: [],
              imageUrl: fc.imageUrl,
              role: "SUPPORTING",
            });
          }
        }
      } catch (e: any) {
        console.warn(`[Admin Ingest] Failed to fetch Fandom category characters: ${e.message}`);
      }
    }

    for (const c of castList) {
      const existing = await prisma.character.findFirst({
        where: {
          mediaId: media.id,
          name: c.name,
        },
      });
      if (!existing) {
        await prisma.character.create({
          data: {
            mediaId: media.id,
            name: c.name,
            aliases: c.aliases,
            imageUrl: c.imageUrl,
            introducedAtChapter: 1, // default until parsed
          },
        });
      } else {
        // Update aliases or imageUrl if missing or broken
        const updateData: { imageUrl?: string; aliases?: string[] } = {};
        if ((!existing.imageUrl || isBrokenImageUrl(existing.imageUrl)) && c.imageUrl) {
          updateData.imageUrl = c.imageUrl;
        }
        const mergedAliases = Array.from(new Set([...existing.aliases, ...c.aliases]));
        if (mergedAliases.length > existing.aliases.length) {
          updateData.aliases = mergedAliases;
        }
        if (Object.keys(updateData).length > 0) {
          await prisma.character.update({
            where: { id: existing.id },
            data: updateData,
          });
        }
      }
    }

    // 4. For each character: Fandom → Gemini → Name Resolution → DraftIngestion
    const characters = await prisma.character.findMany({ where: { mediaId: media.id } });
    const factions = await prisma.faction.findMany({ where: { mediaId: media.id } });
    const results: { characterName: string; status: string; draftId: string }[] = [];

    for (const character of characters) {
      // Skip if already has approved or pending draft
      const existingDraft = await prisma.draftIngestion.findFirst({
        where: { mediaId: media.id, characterName: character.name, status: { in: ["APPROVED", "PENDING", "UNRESOLVED"] } },
      });
      if (existingDraft) {
        results.push({ characterName: character.name, status: `SKIPPED (${existingDraft.status})`, draftId: existingDraft.id });
        continue;
      }

      // Fetch wikitext using smart multi-tier matching (per-character errors must not kill the whole ingest)
      let wikiResult: { title: string; wikitext: string } | null = null;
      try {
        wikiResult = await fetchCharacterWikitextSmart(wikiSubdomain, character.name, character.aliases);
      } catch (err) {
        console.error(`Wiki fetch error for ${character.name}:`, err);
        results.push({ characterName: character.name, status: `WIKI_ERROR: ${err}`, draftId: "" });
        continue;
      }
      if (!wikiResult) {
        results.push({ characterName: character.name, status: "NO_WIKI_PAGE", draftId: "" });
        continue;
      }

      // Add wiki page title to aliases if not already present
      if (wikiResult.title.toLowerCase() !== character.name.toLowerCase() && !character.aliases.includes(wikiResult.title)) {
        await prisma.character.update({
          where: { id: character.id },
          data: { aliases: [...character.aliases, wikiResult.title] },
        });
      }

      // Gemini parse
      let parsed: GeminiParsedCharacter;
      try {
        parsed = await parseCharacterWikitext(
          wikiResult.wikitext,
          character.name,
          chapterNumberingSource,
          parsedTotalChapters,
        );
      } catch (err) {
        results.push({ characterName: character.name, status: `GEMINI_ERROR: ${err}`, draftId: "" });
        continue;
      }

      // Name Resolution
      const { unresolvedNames } = resolveNames(parsed, characters, factions);
      const status = unresolvedNames.length > 0 ? "UNRESOLVED" : "PENDING";

      const draft = await prisma.draftIngestion.create({
        data: {
          mediaId: media.id,
          characterName: character.name,
          rawWikitext: wikiResult.wikitext,
          parsedJson: parsed as object,
          status,
          unresolvedNames,
        },
      });

      // Direct Publish (auto-publish) if enabled and clean
      if (autoPublish && unresolvedNames.length === 0) {
        try {
          // Validate temporal bounds
          for (const d of parsed.descriptions) validateTemporalBounds(d.validFrom, d.validUntil);
          for (const s of parsed.statuses) validateTemporalBounds(s.validFrom, s.validUntil);
          for (const r of parsed.relationships) validateTemporalBounds(r.validFrom, r.validUntil);
          for (const f of parsed.factions) validateTemporalBounds(f.validFrom, f.validUntil);

          // Update introducedAtChapter — nilai dari parse LLM, jadi terverifikasi.
          await prisma.character.update({
            where: { id: character.id },
            data: {
              introducedAtChapter: parsed.introducedAtChapter || 1,
              debutKnown: true,
            },
          });

          // Insert descriptions
          if (parsed.descriptions.length > 0) {
            await prisma.characterDescription.createMany({
              data: parsed.descriptions.map((d) => ({
                characterId: character.id,
                text: d.text,
                validFrom: d.validFrom,
                validUntil: d.validUntil,
                isSensitive: d.isSensitive,
              })),
            });
          }

          // Insert statuses
          if (parsed.statuses.length > 0) {
            await prisma.characterStatus.createMany({
              data: parsed.statuses.map((s) => ({
                characterId: character.id,
                status: s.status,
                validFrom: s.validFrom,
                validUntil: s.validUntil,
                isSensitive: s.isSensitive,
              })),
            });
          }

          // Insert relationships
          for (const r of parsed.relationships) {
            const targetId = resolveCharacterName(r.targetName, characters);
            if (targetId && targetId !== character.id) {
              await prisma.relationship.create({
                data: {
                  mediaId: media.id,
                  sourceCharacterId: character.id,
                  targetCharacterId: targetId,
                  relationType: r.relationType,
                  validFrom: r.validFrom,
                  validUntil: r.validUntil,
                  isSensitive: r.isSensitive,
                },
              });
            }
          }

          // Insert factions
          for (const f of parsed.factions) {
            let factionId = resolveFactionName(f.factionName, factions);
            if (!factionId) {
              const newFaction = await prisma.faction.create({
                data: {
                  mediaId: media.id,
                  name: f.factionName,
                  introducedAtChapter: f.validFrom,
                },
              });
              factionId = newFaction.id;
              factions.push(newFaction);
            }
            await prisma.factionMembership.create({
              data: {
                factionId,
                characterId: character.id,
                validFrom: f.validFrom,
                validUntil: f.validUntil,
                isSensitive: f.isSensitive,
              },
            });
          }

          // Mark draft as approved
          await prisma.draftIngestion.update({
            where: { id: draft.id },
            data: { status: "APPROVED", reviewedAt: new Date() },
          });

          results.push({ characterName: character.name, status: "AUTO_PUBLISHED", draftId: draft.id });
          continue;
        } catch (publishErr) {
          console.error("Auto publish error for", character.name, publishErr);
          // Keep as PENDING if auto-publish failed
        }
      }

      results.push({ characterName: character.name, status, draftId: draft.id });
    }

    return NextResponse.json({ mediaId: media.id, results });
  } catch (err) {
    console.error("Ingest error:", err);
    return NextResponse.json({ error: "Ingestion failed" }, { status: 500 });
  }
}
