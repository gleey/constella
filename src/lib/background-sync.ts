/**
 * Background Sync Service & Automation Engine.
 * 
 * TWO-TIER ARCHITECTURE:
 *  Tier 1 — Catalog Sync (NO AI, cached):
 *    Discovers trending manhwa from AniList, syncs covers, characters, and images
 *    from AniList + Fandom Wiki. Runs automatically in background daemon. Zero AI token cost.
 *
 *  Tier 2 — Lore Sync (AI-powered, manual trigger only):
 *    Parses Fandom wikitext via Gemini/Groq for temporal descriptions, relationships,
 *    statuses, and factions. Only runs when explicitly triggered via API.
 */

import { prisma } from "./prisma";
import { fetchMediaDetail, fetchPopularMedia } from "./anilist";
import {
  fetchCharacterWikitextSmart,
  cleanWikitextForLLM,
  resolveFandomWikiSubdomain,
  fetchCharacterImage,
  fetchFandomCategoryCharacters,
} from "./fandom";
import { parseCharacterWikitext, type GeminiParsedCharacter, normalizeGeminiOutput } from "./gemini";
import { resolveCharacterName } from "./name-resolution";
import { normalizeName, shouldMergeCharacters } from "./name-dedupe";
import { validateTemporalBounds } from "./temporal";
import { isBrokenImageUrl } from "./auto-sync";
import { GoogleGenAI } from "@google/genai";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface BackgroundSyncState {
  isRunning: boolean;
  syncMode: "catalog" | "lore" | null;
  startedAt: string | null;
  finishedAt: string | null;
  progress: number; // 0 to 100
  currentSeries: string;
  currentCharacter: string;
  totalSeries: number;
  completedSeries: number;
  logs: string[];
  lastError: string | null;
}

const globalState: BackgroundSyncState = {
  isRunning: false,
  syncMode: null,
  startedAt: null,
  finishedAt: null,
  progress: 0,
  currentSeries: "",
  currentCharacter: "",
  totalSeries: 0,
  completedSeries: 0,
  logs: [],
  lastError: null,
};

function addLog(msg: string) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = `[${timestamp}] ${msg}`;
  globalState.logs.push(entry);
  if (globalState.logs.length > 200) {
    globalState.logs.shift();
  }
  console.log(`[BackgroundSync] ${msg}`);
}

export function getBackgroundSyncStatus(): BackgroundSyncState {
  return { ...globalState, logs: [...globalState.logs] };
}

// ---------------------------------------------------------------------------
// Tier 1: Catalog Sync — NO AI, only AniList + Fandom APIs (cached)
// ---------------------------------------------------------------------------

/**
 * Discovers and syncs manhwa catalog: media entries, covers, characters, and images.
 * Uses ONLY AniList GraphQL + Fandom MediaWiki APIs. Zero AI token consumption.
 * All API responses are cached in-memory (6-12h TTL).
 */
async function runCatalogSync(targetAnilistId?: number) {
  let targets: { anilistId: number; titleHint?: string }[] = [];

  if (targetAnilistId) {
    targets = [{ anilistId: targetAnilistId }];
  } else {
    // 1. Existing media in database
    const dbMedia = await prisma.media.findMany({ select: { anilistId: true, title: true } });
    const existingIds = new Set(dbMedia.map((m) => m.anilistId));
    targets = dbMedia.map((m) => ({ anilistId: m.anilistId, titleHint: m.title }));

    // 2. Auto-discover top popular manhwa from AniList — fully automatic, no admin needed
    try {
      const popular = await fetchPopularMedia({ page: 1, perPage: 15, countryOfOrigin: "KR", sort: ["POPULARITY_DESC"] });
      for (const p of popular) {
        if (!existingIds.has(p.id)) {
          existingIds.add(p.id);
          targets.push({ anilistId: p.id, titleHint: p.title });
        }
      }
    } catch (e: any) {
      addLog(`Discovery AniList error: ${e.message}`);
    }
  }

  globalState.totalSeries = targets.length;
  globalState.completedSeries = 0;
  globalState.progress = 0;

  addLog(`[Catalog Sync] Memulai sinkronisasi katalog untuk ${targets.length} seri (AniList + Fandom, tanpa AI)...`);

  for (let sIdx = 0; sIdx < targets.length; sIdx++) {
    const target = targets[sIdx];
    globalState.currentSeries = target.titleHint || `AniList #${target.anilistId}`;
    addLog(`[${sIdx + 1}/${targets.length}] Memproses ${globalState.currentSeries}...`);

    try {
      // Fetch media detail from AniList (cached)
      let anilistDetail;
      try {
        anilistDetail = await fetchMediaDetail(target.anilistId);
      } catch (err: any) {
        addLog(`Gagal mengambil AniList detail untuk ID ${target.anilistId}: ${err.message}`);
      }

      if (!anilistDetail) {
        globalState.completedSeries++;
        globalState.progress = Math.round((globalState.completedSeries / globalState.totalSeries) * 100);
        continue;
      }

      globalState.currentSeries = anilistDetail.title;

      // Upsert Media with live cover and chapters
      const media = await prisma.media.upsert({
        where: { anilistId: anilistDetail.id },
        create: {
          anilistId: anilistDetail.id,
          title: anilistDetail.title,
          type: anilistDetail.countryOfOrigin === "KR" ? "MANHWA" : "MANGA",
          coverImage: anilistDetail.coverImage,
          totalChapters: anilistDetail.chapters || 100,
          chapterNumberingSource: "official_en",
          countryOfOrigin: anilistDetail.countryOfOrigin || "KR",
        },
        update: {
          title: anilistDetail.title,
          coverImage: anilistDetail.coverImage,
          totalChapters: anilistDetail.chapters && anilistDetail.chapters > 0 ? anilistDetail.chapters : undefined,
        },
      });

      // Resolve Fandom Wiki (cached)
      const wikiSubdomain = await resolveFandomWikiSubdomain(anilistDetail.title, anilistDetail.synonyms);
      if (wikiSubdomain) {
        addLog(`Fandom wiki: "${wikiSubdomain}" untuk ${anilistDetail.title}`);
      }

      // Build character list from AniList, fallback to Fandom Category:Characters
      let charactersToSync: Array<{
        name: string;
        aliases: string[];
        imageUrl: string;
        role?: string;
      }> = [];

      if (anilistDetail.characters && anilistDetail.characters.length > 0) {
        charactersToSync = anilistDetail.characters;
      } else if (wikiSubdomain) {
        addLog(`AniList characters kosong. Mengambil dari Fandom Category:Characters...`);
        const fandomChars = await fetchFandomCategoryCharacters(wikiSubdomain, 20);
        charactersToSync = fandomChars.map((fc, i) => ({
          name: fc.name,
          aliases: [],
          imageUrl: fc.imageUrl,
          role: i === 0 ? "MAIN" : "SUPPORTING",
        }));
      }

      // Normalize incoming names (collapse whitespace) so "Hades " etc.
      // never create a second row next to "Hades".
      charactersToSync = charactersToSync
        .map((c) => ({ ...c, name: normalizeName(c.name) }))
        .filter((c) => c.name.length > 0);

      // Upsert characters with live images
      // First, calculate estimated introduction chapters based on role and order
      const mainChars = charactersToSync.filter((c) => c.role === "MAIN");
      const supportingChars = charactersToSync.filter((c) => c.role !== "MAIN");
      const totalChapters = anilistDetail.chapters && anilistDetail.chapters > 0 ? anilistDetail.chapters : 100;

      // Estimate introduction chapter: MAIN = 1, SUPPORTING distributed across early chapters
      const charIntroMap = new Map<string, number>();
      for (const c of mainChars) {
        charIntroMap.set(c.name, 1);
      }
      // Distribute supporting characters: first supporting ~ch 5-10, then spaced out
      for (let i = 0; i < supportingChars.length; i++) {
        const estimatedCh = Math.min(Math.max(5, Math.round((i + 1) * (totalChapters / (supportingChars.length + 1)))), totalChapters - 5);
        charIntroMap.set(supportingChars[i].name, estimatedCh);
      }

      // Load existing characters once for conservative dedup (prevents
      // AniList romanization variants like "Dok-Ja Kim" duplicating "Kim Dokja").
      const dbChars = await prisma.character.findMany({
        where: { mediaId: media.id },
        select: { id: true, name: true, aliases: true, imageUrl: true, introducedAtChapter: true },
      });

      for (const c of charactersToSync) {
        let finalImage = c.imageUrl;

        // Fetch Fandom image if AniList image broken/missing (cached)
        if (isBrokenImageUrl(finalImage) && wikiSubdomain) {
          try {
            const fandomImg = await fetchCharacterImage(wikiSubdomain, c.name, c.aliases);
            if (fandomImg) finalImage = fandomImg;
          } catch {
            // non-fatal
          }
        }

        const estimatedIntro = charIntroMap.get(c.name) || 1;
        // Exact match first, then conservative same-person match
        // (canon-equal / token-reorder / curated-pair — never fuzzy).
        let existing = dbChars.find((d) => d.name === c.name) ?? null;
        if (!existing) {
          const dupe = dbChars.find((d) => shouldMergeCharacters(c.name, d.name) !== null);
          if (dupe) {
            addLog(`Dedup: "${c.name}" sudah ada sebagai "${dupe.name}" — digabung, bukan duplikat.`);
            existing = dupe;
          }
        }

        if (existing) {
          // Update image if current one is broken + merge aliases (incl. variant name)
          if (finalImage && isBrokenImageUrl(existing.imageUrl)) {
            await prisma.character.update({
              where: { id: existing.id },
              data: {
                imageUrl: finalImage,
                aliases: Array.from(new Set([...existing.aliases, ...c.aliases, c.name])),
              },
            });
            existing.imageUrl = finalImage;
          } else if (c.name !== existing.name && !existing.aliases.includes(c.name)) {
            await prisma.character.update({
              where: { id: existing.id },
              data: { aliases: Array.from(new Set([...existing.aliases, c.name])) },
            });
            existing.aliases = [...existing.aliases, c.name];
          }
          // Only adjust introducedAtChapter for lore-less placeholder rows.
          // Curated rows (with descriptions/statuses/relationships) keep their
          // hand-verified debut chapters.
          if (existing.introducedAtChapter === 1 && estimatedIntro > 1) {
            const [dCount, sCount, rCount] = await Promise.all([
              prisma.characterDescription.count({ where: { characterId: existing.id } }),
              prisma.characterStatus.count({ where: { characterId: existing.id } }),
              prisma.relationship.count({
                where: { OR: [{ sourceCharacterId: existing.id }, { targetCharacterId: existing.id }] },
              }),
            ]);
            if (dCount + sCount + rCount === 0) {
              await prisma.character.update({
                where: { id: existing.id },
                data: { introducedAtChapter: estimatedIntro },
              });
              existing.introducedAtChapter = estimatedIntro;
            }
          }
        } else {
          const created = await prisma.character.create({
            data: {
              mediaId: media.id,
              name: c.name,
              aliases: c.aliases,
              imageUrl: finalImage || "",
              introducedAtChapter: estimatedIntro,
            },
          });
          dbChars.push({
            id: created.id,
            name: created.name,
            aliases: created.aliases,
            imageUrl: created.imageUrl,
            introducedAtChapter: created.introducedAtChapter,
          });
        }
      }

      // Create basic relationships between MAIN characters (no AI needed)
      if (mainChars.length >= 2) {
        const allChars = await prisma.character.findMany({ where: { mediaId: media.id } });
        const charByName = new Map(allChars.map((ch) => [ch.name, ch]));

        // Find protagonist (first MAIN character)
        const protagonist = mainChars[0]?.name;
        if (protagonist && charByName.has(protagonist)) {
          const protoId = charByName.get(protagonist)!.id;

          // Create relationships with other MAIN characters
          for (let i = 1; i < mainChars.length; i++) {
            const otherName = mainChars[i].name;
            if (!charByName.has(otherName)) continue;
            const otherId = charByName.get(otherName)!.id;

            // Heuristic: first 2 MAIN = rivals, rest = allies
            const relationType = i <= 2 ? "Rival" : "Ally";
            const validFrom = Math.max(charIntroMap.get(protagonist) || 1, charIntroMap.get(otherName) || 1);

            if (protoId === otherId) continue; // never link a character to itself
            // Unordered + same-type check: skips if EITHER direction already has this relation.
            const exists = await prisma.relationship.findFirst({
              where: {
                mediaId: media.id,
                relationType,
                OR: [
                  { sourceCharacterId: protoId, targetCharacterId: otherId },
                  { sourceCharacterId: otherId, targetCharacterId: protoId },
                ],
              },
            });

            if (!exists) {
              await prisma.relationship.create({
                data: {
                  mediaId: media.id,
                  sourceCharacterId: protoId,
                  targetCharacterId: otherId,
                  relationType,
                  validFrom,
                  validUntil: null,
                  isSensitive: false,
                },
              });
              // Also create reverse relationship
              await prisma.relationship.create({
                data: {
                  mediaId: media.id,
                  sourceCharacterId: otherId,
                  targetCharacterId: protoId,
                  relationType,
                  validFrom,
                  validUntil: null,
                  isSensitive: false,
                },
              });
            }
          }
        }
      }

      // Chain edges: link characters consecutive by debut chapter so EVERY
      // character has >= 1 relationship — including non-MC to non-MC pairs.
      // Edge appears exactly when the later of the two debuts
      // (validFrom = max of both intros), so chapter progression always
      // grows both nodes and connecting lines.
      {
        const allChars = await prisma.character.findMany({ where: { mediaId: media.id } });
        const sorted = [...allChars].sort(
          (a, b) => a.introducedAtChapter - b.introducedAtChapter || a.name.localeCompare(b.name),
        );
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1];
          const cur = sorted[i];
          if (prev.id === cur.id) continue; // safety: never self-link
          const exists = await prisma.relationship.findFirst({
            where: {
              mediaId: media.id,
              OR: [
                { sourceCharacterId: prev.id, targetCharacterId: cur.id },
                { sourceCharacterId: cur.id, targetCharacterId: prev.id },
              ],
            },
          });
          if (!exists) {
            const vf = Math.max(prev.introducedAtChapter, cur.introducedAtChapter);
            for (const [s, t] of [[prev.id, cur.id], [cur.id, prev.id]] as const) {
              await prisma.relationship.create({
                data: {
                  mediaId: media.id,
                  sourceCharacterId: s,
                  targetCharacterId: t,
                  relationType: "Ally",
                  validFrom: vf,
                  validUntil: null,
                  isSensitive: false,
                },
              });
            }
          }
        }

        // Align validFrom: no edge may start before both endpoints debuted.
        const rels = await prisma.relationship.findMany({ where: { mediaId: media.id } });
        const introOf = new Map(allChars.map((c) => [c.id, c.introducedAtChapter]));
        for (const r of rels) {
          const need = Math.max(introOf.get(r.sourceCharacterId) ?? 1, introOf.get(r.targetCharacterId) ?? 1);
          if (r.validFrom < need) {
            await prisma.relationship.update({
              where: { id: r.id },
              data: {
                validFrom: need,
                validUntil: r.validUntil !== null && r.validUntil <= need ? null : undefined,
              },
            });
          }
        }
      }

      addLog(`Katalog ${anilistDetail.title} berhasil disinkronkan (${charactersToSync.length} karakter).`);
      globalState.completedSeries++;
      globalState.progress = Math.round((globalState.completedSeries / globalState.totalSeries) * 100);
    } catch (err: any) {
      addLog(`Error pada seri ID ${target.anilistId}: ${err.message}`);
      globalState.lastError = err.message;
    }
  }

  addLog("[Catalog Sync] Sinkronisasi katalog selesai!");
}

// ---------------------------------------------------------------------------
// Tier 2: Lore Sync — AI-powered (Gemini/Groq), manual trigger only
// ---------------------------------------------------------------------------

async function synthesizeLoreFallback(
  characterName: string,
  seriesTitle: string,
  totalChapters: number,
  allKnownCharacters: string[]
): Promise<GeminiParsedCharacter> {
  const apiKey = process.env.GEMINI_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;

  const prompt = `You are an expert anime/manga/manhwa lore archivist.
Provide accurate, lore-grounded structured character data for:
Character: "${characterName}" from the series "${seriesTitle}" (Total chapters: ${totalChapters}).
Other major characters in this series include: ${allKnownCharacters.slice(0, 15).join(", ")}.

REQUIREMENTS:
1. Provide 3 to 6 chronological story description phases across chapter arcs (validUntil is exclusive).
2. Provide statuses across chapter arcs (Alive, Deceased, MIA, Imprisoned).
3. Provide 2 to 6 specific, lore-accurate relationships with other characters from the series ("Enemy", "Partner", "Rival", "Love Interest", "Husband / Wife", "Friend", "Master / Disciple", "Father / Son", "Mother / Son", "Brother / Sister", "Allies", "Contractor", "Guild Member", "Subordinate", "Superior"). NEVER use "Connected".
4. Provide known factions/guilds with validFrom/validUntil.
5. Return ONLY a JSON object matching this schema (no markdown fences):
{
  "introducedAtChapter": <number>,
  "descriptions": [{ "text": "<string>", "validFrom": <number>, "validUntil": <number|null>, "isSensitive": <boolean> }],
  "statuses": [{ "status": "<string>", "validFrom": <number>, "validUntil": <number|null>, "isSensitive": <boolean> }],
  "relationships": [{ "targetName": "<string>", "relationType": "<string>", "validFrom": <number>, "validUntil": <number|null>, "isSensitive": <boolean> }],
  "factions": [{ "factionName": "<string>", "validFrom": <number>, "validUntil": <number|null>, "isSensitive": <boolean> }]
}`;

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const res = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: prompt,
        config: { temperature: 0.2 },
      });
      const text = (res.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const parsed = JSON.parse(text);
      return normalizeGeminiOutput(parsed, totalChapters);
    } catch {
      // jump to Groq
    }
  }

  if (groqApiKey) {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: "You are an expert anime/manga lore archivist. Return valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (groqRes.ok) {
      const data = await groqRes.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      return normalizeGeminiOutput(parsed, totalChapters);
    }
  }

  throw new Error(`Gagal sintesis lore untuk ${characterName}`);
}

/**
 * AI-powered lore extraction for a specific series or all series.
 * Parses Fandom wikitext via Gemini/Groq for descriptions, relationships, statuses, factions.
 * CONSUMES AI TOKENS — only triggered manually via API.
 */
async function runLoreSync(targetAnilistId?: number) {
  let mediaList: Array<{ id: string; anilistId: number; title: string; totalChapters: number; chapterNumberingSource: string }>;

  if (targetAnilistId) {
    const m = await prisma.media.findFirst({ where: { anilistId: targetAnilistId } });
    if (!m) throw new Error(`Media AniList ID ${targetAnilistId} tidak ditemukan di database`);
    mediaList = [m];
  } else {
    mediaList = await prisma.media.findMany();
  }

  globalState.totalSeries = mediaList.length;
  globalState.completedSeries = 0;
  globalState.progress = 0;

  addLog(`[Lore Sync] Memulai ekstraksi lore AI untuk ${mediaList.length} seri (MEMAKAN TOKEN AI)...`);

  for (let sIdx = 0; sIdx < mediaList.length; sIdx++) {
    const media = mediaList[sIdx];
    globalState.currentSeries = media.title;
    addLog(`[${sIdx + 1}/${mediaList.length}] Lore sync: ${media.title}`);

    try {
      // Resolve Fandom wiki
      const wikiSubdomain = await resolveFandomWikiSubdomain(media.title);

      const dbCharacters = await prisma.character.findMany({ where: { mediaId: media.id } });
      const allNamesList = dbCharacters.map((c) => c.name);

      // Prioritize MAIN characters (limit to 6 to control AI token cost)
      const priorityChars = dbCharacters.slice(0, 6);

      for (const dbChar of priorityChars) {
        globalState.currentCharacter = dbChar.name;

        // Fix broken character images while we're at it
        if (isBrokenImageUrl(dbChar.imageUrl) && wikiSubdomain) {
          try {
            const liveImg = await fetchCharacterImage(wikiSubdomain, dbChar.name, dbChar.aliases);
            if (liveImg) {
              await prisma.character.update({ where: { id: dbChar.id }, data: { imageUrl: liveImg } });
              dbChar.imageUrl = liveImg;
            }
          } catch {}
        }

        let parsed: GeminiParsedCharacter | null = null;

        // Try Fandom wikitext → LLM parsing
        if (wikiSubdomain) {
          try {
            const wikiRes = await fetchCharacterWikitextSmart(wikiSubdomain, dbChar.name, dbChar.aliases);
            if (wikiRes && wikiRes.wikitext.length > 400) {
              const cleaned = cleanWikitextForLLM(wikiRes.wikitext, 8000);
              parsed = await parseCharacterWikitext(cleaned, dbChar.name, media.chapterNumberingSource, media.totalChapters);
            }
          } catch {
            // fallback
          }
        }

        // Fallback: LLM synthesis without wikitext
        if (!parsed) {
          try {
            parsed = await synthesizeLoreFallback(dbChar.name, media.title, media.totalChapters, allNamesList);
          } catch (e: any) {
            addLog(`Sintesis lore dilewati untuk ${dbChar.name}: ${e.message}`);
          }
        }

        if (!parsed) continue;

        // Save debut chapter
        const introduced = Math.min(Math.max(1, parsed.introducedAtChapter || 1), media.totalChapters);
        await prisma.character.update({
          where: { id: dbChar.id },
          data: { introducedAtChapter: introduced },
        });

        // Save Descriptions
        if (parsed.descriptions && parsed.descriptions.length > 0) {
          await prisma.characterDescription.deleteMany({ where: { characterId: dbChar.id } });
          for (const d of parsed.descriptions) {
            const vFrom = Math.max(1, d.validFrom || introduced);
            const vUntil = d.validUntil !== null && d.validUntil > vFrom ? d.validUntil : null;
            try {
              validateTemporalBounds(vFrom, vUntil);
              await prisma.characterDescription.create({
                data: {
                  characterId: dbChar.id,
                  text: d.text,
                  validFrom: vFrom,
                  validUntil: vUntil,
                  isSensitive: Boolean(d.isSensitive),
                },
              });
            } catch {}
          }
        }

        // Save Statuses
        if (parsed.statuses && parsed.statuses.length > 0) {
          await prisma.characterStatus.deleteMany({ where: { characterId: dbChar.id } });
          for (const s of parsed.statuses) {
            const vFrom = Math.max(1, s.validFrom || introduced);
            const vUntil = s.validUntil !== null && s.validUntil > vFrom ? s.validUntil : null;
            try {
              validateTemporalBounds(vFrom, vUntil);
              await prisma.characterStatus.create({
                data: {
                  characterId: dbChar.id,
                  status: s.status || "Alive",
                  validFrom: vFrom,
                  validUntil: vUntil,
                  isSensitive: Boolean(s.isSensitive),
                },
              });
            } catch {}
          }
        }

        // Save Relationships
        if (parsed.relationships && parsed.relationships.length > 0) {
          for (const r of parsed.relationships) {
            if (!r.targetName || !r.relationType) continue;
            const targetCharId = resolveCharacterName(r.targetName, dbCharacters);
            if (!targetCharId || targetCharId === dbChar.id) continue;

            const vFrom = Math.max(1, r.validFrom || introduced);
            const vUntil = r.validUntil !== null && r.validUntil > vFrom ? r.validUntil : null;
            try {
              validateTemporalBounds(vFrom, vUntil);
              // Unordered + same-type check so re-running lore sync never
              // stacks a second identical line on the same pair.
              const exists = await prisma.relationship.findFirst({
                where: {
                  mediaId: media.id,
                  relationType: r.relationType,
                  OR: [
                    { sourceCharacterId: dbChar.id, targetCharacterId: targetCharId },
                    { sourceCharacterId: targetCharId, targetCharacterId: dbChar.id },
                  ],
                },
              });
              if (!exists) {
                await prisma.relationship.create({
                  data: {
                    mediaId: media.id,
                    sourceCharacterId: dbChar.id,
                    targetCharacterId: targetCharId,
                    relationType: r.relationType,
                    validFrom: vFrom,
                    validUntil: vUntil,
                    isSensitive: Boolean(r.isSensitive),
                  },
                });
              }
            } catch {}
          }
        }

        addLog(`Lore karakter ${dbChar.name} berhasil diekstrak.`);
        await new Promise((r) => setTimeout(r, 2000)); // rate limit buffer
      }

      globalState.completedSeries++;
      globalState.progress = Math.round((globalState.completedSeries / globalState.totalSeries) * 100);
    } catch (err: any) {
      addLog(`Error lore sync ${media.title}: ${err.message}`);
      globalState.lastError = err.message;
    }
  }

  addLog("[Lore Sync] Ekstraksi lore selesai!");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function finishSync() {
  globalState.isRunning = false;
  globalState.finishedAt = new Date().toISOString();
  globalState.currentSeries = "";
  globalState.currentCharacter = "";
  globalState.progress = 100;
  globalState.syncMode = null;
}

/**
 * Start Tier 1 catalog sync (NO AI, cached API calls only).
 * Safe to run automatically — zero token cost.
 */
export function startCatalogSync(targetAnilistId?: number): { started: boolean; message: string } {
  if (globalState.isRunning) {
    return {
      started: false,
      message: `Sinkronisasi sedang berjalan (${globalState.syncMode}, ${globalState.progress}%)`,
    };
  }

  globalState.isRunning = true;
  globalState.syncMode = "catalog";
  globalState.startedAt = new Date().toISOString();
  globalState.finishedAt = null;
  globalState.progress = 0;
  globalState.lastError = null;

  setImmediate(() => {
    runCatalogSync(targetAnilistId)
      .then(() => finishSync())
      .catch((err) => {
        console.error("Catalog sync fatal error:", err);
        globalState.lastError = err.message;
        finishSync();
      });
  });

  return { started: true, message: "Catalog sync dimulai (tanpa AI, cached)." };
}

/**
 * Start Tier 2 lore sync (AI-powered — CONSUMES TOKENS).
 * Only triggered manually via API. Not run by background daemon.
 */
export function startLoreSync(targetAnilistId?: number): { started: boolean; message: string } {
  if (globalState.isRunning) {
    return {
      started: false,
      message: `Sinkronisasi sedang berjalan (${globalState.syncMode}, ${globalState.progress}%)`,
    };
  }

  globalState.isRunning = true;
  globalState.syncMode = "lore";
  globalState.startedAt = new Date().toISOString();
  globalState.finishedAt = null;
  globalState.progress = 0;
  globalState.lastError = null;

  setImmediate(() => {
    runLoreSync(targetAnilistId)
      .then(() => finishSync())
      .catch((err) => {
        console.error("Lore sync fatal error:", err);
        globalState.lastError = err.message;
        finishSync();
      });
  });

  return { started: true, message: "Lore sync dimulai (AI-powered, memakan token)." };
}

/** @deprecated Use startCatalogSync instead. Kept for backward compatibility. */
export function startBackgroundSync(targetAnilistId?: number): { started: boolean; message: string } {
  return startCatalogSync(targetAnilistId);
}

// ---------------------------------------------------------------------------
// Background Daemon — runs Tier 1 ONLY (no AI tokens)
// ---------------------------------------------------------------------------

let daemonStarted = false;

/**
 * Background daemon that auto-runs catalog sync on startup + periodic intervals.
 * Only Tier 1 (catalog sync) — NO AI token consumption.
 */
export function initBackgroundDaemon(intervalHours = 6) {
  if (daemonStarted) return;
  daemonStarted = true;

  addLog(`Background daemon aktif (interval: ${intervalHours} jam). Hanya catalog sync (tanpa AI).`);

  // Defer initial run by 8 seconds
  setTimeout(() => {
    if (!globalState.isRunning) {
      addLog("Menjalankan catalog sync otomatis awal...");
      startCatalogSync();
    }
  }, 8000);

  // Periodic interval
  setInterval(() => {
    if (!globalState.isRunning) {
      addLog(`Menjalankan catalog sync otomatis berkala (${intervalHours} jam)...`);
      startCatalogSync();
    }
  }, intervalHours * 60 * 60 * 1000);
}
