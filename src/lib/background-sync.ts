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
import { fetchMediaDetail, fetchPopularMedia, mediaTitleForms } from "./anilist";
import {
  fetchCharacterWikitextSmart,
  cleanWikitextForLLM,
  resolveFandomWikiSubdomain,
  fetchCharacterImage,
  fetchFandomCategoryCharacters,
} from "./fandom";
import { parseCharacterWikitext, type GeminiParsedCharacter, normalizeGeminiOutput, getGeminiModels } from "./gemini";
import { resolveCharacterName } from "./name-resolution";
import { fetchAltCharacterText, fetchAltCharacterRoster } from "./alt-sources";
import { normalizeName, shouldMergeCharacters, canonicalizeName } from "./name-dedupe";
import { validateTemporalBounds } from "./temporal";
import { resolveTotalChapters } from "./chapter-count";
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
  lastCatalogSync: string | null;
  lastLoreSync: string | null;
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
  lastCatalogSync: null,
  lastLoreSync: null,
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

/** Reset the visible log for a fresh manual run so stale entries don't dilute it. */
function clearLogs() {
  globalState.logs = [];
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

    // 2. Auto-discover top popular + recently updated ongoing manhwa & manga from AniList
    try {
      const [popular, ongoing] = await Promise.all([
        fetchPopularMedia({ page: 1, perPage: 20, countryOfOrigin: "KR", sort: ["POPULARITY_DESC"] }),
        fetchPopularMedia({ page: 1, perPage: 20, countryOfOrigin: "KR", sort: ["UPDATED_AT_DESC"], status: "RELEASING" }),
      ]);
      for (const p of [...popular, ...ongoing]) {
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

      // Chapter count: AniList is null for ongoing series, so resolve through
      // Kitsu/MangaUpdates and keep the previously known value as a floor.
      // This replaces the old static `|| 100` placeholder.
      const previousMedia = await prisma.media.findUnique({
        where: { anilistId: anilistDetail.id },
        select: { totalChapters: true },
      });
      const { totalChapters: resolvedTotalChapters, source: chapterSource } =
        await resolveTotalChapters(anilistDetail, previousMedia?.totalChapters);
      if (chapterSource === "live") {
        addLog(`Chapter live untuk ${anilistDetail.title}: ${resolvedTotalChapters} (AniList belum punya angka).`);
      }

      // Upsert Media with live cover and chapters
      const media = await prisma.media.upsert({
        where: { anilistId: anilistDetail.id },
        create: {
          anilistId: anilistDetail.id,
          title: anilistDetail.title,
          type: anilistDetail.countryOfOrigin === "KR" ? "MANHWA" : "MANGA",
          coverImage: anilistDetail.coverImage,
          totalChapters: resolvedTotalChapters,
          chapterNumberingSource: "official_en",
          countryOfOrigin: anilistDetail.countryOfOrigin || "KR",
          status: anilistDetail.status,
          contentRating: anilistDetail.contentRating,
          genres: anilistDetail.genres,
        },
        update: {
          title: anilistDetail.title,
          coverImage: anilistDetail.coverImage,
          totalChapters: resolvedTotalChapters,
          status: anilistDetail.status !== "RELEASING" ? anilistDetail.status : undefined,
          contentRating: anilistDetail.contentRating,
          genres: anilistDetail.genres,
        },
      });

      // Resolve Fandom Wiki fresh on every sync. Wiki resolution can improve
      // (new disambiguation rules, wikis being created/moved), so the result
      // must never be frozen in the database.
      const wikiSubdomain = await resolveFandomWikiSubdomain(
        anilistDetail.title,
        mediaTitleForms(anilistDetail),
        anilistDetail.characters?.length ?? 0,
      );
      if (wikiSubdomain) {
        addLog(`Fandom wiki: "${wikiSubdomain}" untuk ${anilistDetail.title}`);
      }

      // Full-refresh roster sync: every catalog run rebuilds this series'
      // roster from the sources and removes rows that no source backs anymore.
      // Characters pulled in by a previously mis-resolved wiki (e.g. Bastard
      // holding the whole "Bastard!!" manga cast) are deleted here instead of
      // persisting forever; the lore sync then re-extracts whoever remains, so
      // there is no "already synced → skip" shortcut anywhere in the pipeline.
      const staleIdsBefore = new Set(
        (await prisma.character.findMany({ where: { mediaId: media.id }, select: { id: true } })).map((c) => c.id),
      );
      const keepCharacterIds = new Set<string>();
      const markKept = (id: string) => {
        keepCharacterIds.add(id);
        staleIdsBefore.delete(id);
      };

      // Build character list from AniList, fallback to Fandom Category:Characters
      let charactersToSync: Array<{
        name: string;
        aliases: string[];
        imageUrl: string;
        role?: string;
      }> = [];

      if (anilistDetail.characters && anilistDetail.characters.length > 0) {
        charactersToSync = anilistDetail.characters.map((c) => ({
          ...c,
          aliases: [...(c.aliases || [])],
        }));
      }

      // Merge in additional cast members from Fandom Wiki if available
      if (wikiSubdomain) {
        try {
          const fandomChars = await fetchFandomCategoryCharacters(wikiSubdomain, 35);
          if (fandomChars.length > 0) {
            addLog(`Ditemukan ${fandomChars.length} karakter dari Fandom Category:Characters (${wikiSubdomain}).`);
          }
          for (const fc of fandomChars) {
            const matchIndex = charactersToSync.findIndex((c) =>
              shouldMergeCharacters(c.name, fc.name) !== null ||
              canonicalizeName(c.name) === canonicalizeName(fc.name)
            );
            if (matchIndex >= 0) {
              const matched = charactersToSync[matchIndex];
              if (isBrokenImageUrl(matched.imageUrl) && fc.imageUrl) {
                matched.imageUrl = fc.imageUrl;
              }
              if (!matched.aliases.includes(fc.name)) {
                matched.aliases.push(fc.name);
              }
            } else {
              charactersToSync.push({
                name: fc.name,
                aliases: [],
                imageUrl: fc.imageUrl,
                role: charactersToSync.length === 0 ? "MAIN" : "SUPPORTING",
              });
            }
          }
        } catch (e: any) {
          addLog(`Gagal mengambil karakter Fandom: ${e.message}`);
        }
      }

      // Fallback: no Fandom wiki (or it yielded no cast) → Wikipedia / Kitsu.
      // This is what lets licensed manhwa and small manga still get a cast.
      if (charactersToSync.length === 0) {
        try {
          const altRoster = await fetchAltCharacterRoster(
            anilistDetail.title,
            mediaTitleForms(anilistDetail),
            anilistDetail.countryOfOrigin === "KR" ? "MANHWA" : "MANGA",
            40,
          );
          if (altRoster.length > 0) {
            addLog(`Sumber alternatif: ditemukan ${altRoster.length} karakter untuk ${anilistDetail.title}.`);
            for (const rc of altRoster) {
              charactersToSync.push({
                name: rc.name,
                aliases: rc.aliases,
                imageUrl: rc.imageUrl,
                role: charactersToSync.length === 0 ? "MAIN" : "SUPPORTING",
              });
            }
          }
        } catch (e) {
          addLog(`Gagal mengambil karakter dari sumber alternatif: ${(e as Error).message}`);
        }
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
      const totalChapters = resolvedTotalChapters;

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
        select: { id: true, name: true, aliases: true, imageUrl: true, introducedAtChapter: true, debutKnown: true },
      });

      // Resolve broken/missing portraits in parallel BEFORE the DB loop so the
      // per-character network calls overlap instead of serializing on each
      // create/update. Concurrency-bounded to be a good API citizen.
      const resolvedImages: (string | null)[] = new Array(charactersToSync.length).fill(null);
      if (wikiSubdomain) {
        const IMG_CONCURRENCY = 6;
        for (let i = 0; i < charactersToSync.length; i += IMG_CONCURRENCY) {
          const batch = charactersToSync.slice(i, i + IMG_CONCURRENCY);
          const results = await Promise.allSettled(
            batch.map((c, j) =>
              isBrokenImageUrl(c.imageUrl)
                ? fetchCharacterImage(wikiSubdomain, c.name, c.aliases)
                : Promise.resolve(null)
            )
          );
          results.forEach((r, j) => {
            if (r.status === "fulfilled" && r.value) resolvedImages[i + j] = r.value;
          });
        }
      }

      for (let idx = 0; idx < charactersToSync.length; idx++) {
        const c = charactersToSync[idx];
        let finalImage = c.imageUrl;

        // Fetch Fandom image if AniList image broken/missing (cached)
        if (isBrokenImageUrl(finalImage) && wikiSubdomain && resolvedImages[idx]) {
          finalImage = resolvedImages[idx]!;
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

        // Every sync overwrites the row's mutable fields from the fresh source
        // data — nothing is skipped because it "was synced before". Matching
        // rows are also marked as kept so the stale-row purge below knows this
        // row is backed by a current source.
        if (existing) {
          markKept(existing.id);
          const aliasSet = new Set([...existing.aliases, ...c.aliases]);
          if (c.name !== existing.name) aliasSet.add(c.name);
          const nextAliases = Array.from(aliasSet).filter((a) => a !== existing.name);
          const nextImage = finalImage || existing.imageUrl;
          // Jangan timpa chapter debut yang sudah terverifikasi (lore/wiki) dengan
          // estimasi role-based — estimasi hanya untuk yang debutKnown = false.
          const nextIntro = existing.debutKnown
            ? existing.introducedAtChapter
            : Math.max(1, Math.min(estimatedIntro, totalChapters));
          if (
            nextImage !== existing.imageUrl ||
            nextAliases.length !== existing.aliases.length ||
            nextIntro !== existing.introducedAtChapter
          ) {
            await prisma.character.update({
              where: { id: existing.id },
              data: {
                imageUrl: nextImage,
                aliases: nextAliases,
                introducedAtChapter: nextIntro,
              },
            });
            existing.imageUrl = nextImage;
            existing.aliases = nextAliases;
            existing.introducedAtChapter = nextIntro;
          }
        } else {
          const created = await prisma.character.create({
            data: {
              mediaId: media.id,
              name: c.name,
              aliases: c.aliases,
              imageUrl: finalImage || "",
              introducedAtChapter: estimatedIntro,
              isProtagonist: c.name === (mainChars[0]?.name ?? ""),
            },
          });
          dbChars.push({
            id: created.id,
            name: created.name,
            aliases: created.aliases,
            imageUrl: created.imageUrl,
            introducedAtChapter: created.introducedAtChapter,
            debutKnown: created.debutKnown,
          });
        }
      }

      // Create basic relationships between MAIN characters (no AI needed)
      if (mainChars.length >= 2) {
        const allChars = await prisma.character.findMany({ where: { mediaId: media.id } });
        const charByName = new Map(allChars.map((ch) => [ch.name, ch]));

        // Load ALL existing relationships for this media once, then reason in
        // memory. This replaces ~70 findFirst + ~140 create + ~70 update round
        // trips per series with 2 bulk reads + a couple of createMany calls.
        const existingRels = await prisma.relationship.findMany({ where: { mediaId: media.id } });
        // Unordered pair key independent of direction, plus relationType for the
        // main-character heuristic which is type-specific.
        const relKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
        const existingByType = new Set(existingRels.map((r) => `${relKey(r.sourceCharacterId, r.targetCharacterId)}|${r.relationType}`));
        const existingAnyType = new Set(existingRels.map((r) => relKey(r.sourceCharacterId, r.targetCharacterId)));

        const toCreate: Array<{
          mediaId: string; sourceCharacterId: string; targetCharacterId: string;
          relationType: string; validFrom: number; validUntil: null; isSensitive: boolean;
        }> = [];

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
            if (existingByType.has(`${relKey(protoId, otherId)}|${relationType}`)) continue;

            // Forward + reverse
            toCreate.push(
              { mediaId: media.id, sourceCharacterId: protoId, targetCharacterId: otherId, relationType, validFrom, validUntil: null, isSensitive: false },
              { mediaId: media.id, sourceCharacterId: otherId, targetCharacterId: protoId, relationType, validFrom, validUntil: null, isSensitive: false },
            );
            existingByType.add(`${relKey(protoId, otherId)}|${relationType}`);
            existingAnyType.add(relKey(protoId, otherId));
          }
        }

        // Chain edges: link characters consecutive by debut chapter so EVERY
        // character has >= 1 relationship — including non-MC to non-MC pairs.
        // Edge appears exactly when the later of the two debuts
        // (validFrom = max of both intros), so chapter progression always
        // grows both nodes and connecting lines.
        const sorted = [...allChars].sort(
          (a, b) => a.introducedAtChapter - b.introducedAtChapter || a.name.localeCompare(b.name),
        );
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1];
          const cur = sorted[i];
          if (prev.id === cur.id) continue; // safety: never self-link
          if (existingAnyType.has(relKey(prev.id, cur.id))) continue;
          const vf = Math.max(prev.introducedAtChapter, cur.introducedAtChapter);
          toCreate.push(
            { mediaId: media.id, sourceCharacterId: prev.id, targetCharacterId: cur.id, relationType: "Ally", validFrom: vf, validUntil: null, isSensitive: false },
            { mediaId: media.id, sourceCharacterId: cur.id, targetCharacterId: prev.id, relationType: "Ally", validFrom: vf, validUntil: null, isSensitive: false },
          );
          existingAnyType.add(relKey(prev.id, cur.id));
        }

        if (toCreate.length > 0) {
          await prisma.relationship.createMany({ data: toCreate });
        }

        // Align validFrom: no edge may start before both endpoints debuted.
        // Merge in the just-created rows (they are already aligned by
        // construction) then batch updates by distinct target validFrom.
        const allRels = [...existingRels, ...toCreate.map((c, i) => ({ id: `new-${i}`, ...c }))];
        const introOf = new Map(allChars.map((c) => [c.id, c.introducedAtChapter]));
        const updatesByValidFrom = new Map<number, string[]>();
        for (const r of allRels) {
          const need = Math.max(introOf.get(r.sourceCharacterId) ?? 1, introOf.get(r.targetCharacterId) ?? 1);
          if (r.validFrom < need && !r.id.startsWith("new-")) {
            const arr = updatesByValidFrom.get(need) ?? [];
            arr.push(r.id);
            updatesByValidFrom.set(need, arr);
          }
        }
        for (const [need, ids] of updatesByValidFrom) {
          await prisma.relationship.updateMany({
            where: { id: { in: ids } },
            data: { validFrom: need },
          });
        }
      }

      addLog(`Katalog ${anilistDetail.title} berhasil disinkronkan (${charactersToSync.length} karakter).`);

      // Purge rows no current source backs (mis-resolved wiki leftovers, cast
      // removals). Their lore (descriptions/statuses/memberships/relations)
      // cascades with them, so no foreign-series data survives a re-sync.
      const staleIds = Array.from(staleIdsBefore);
      if (staleIds.length > 0) {
        const staleNames = (
          await prisma.character.findMany({
            where: { id: { in: staleIds } },
            select: { name: true },
          })
        ).map((c) => c.name);
        await prisma.character.deleteMany({ where: { id: { in: staleIds } } });
        addLog(`Membersihkan ${staleIds.length} karakter usang dari ${anilistDetail.title}: ${staleNames.slice(0, 8).join(", ")}${staleNames.length > 8 ? ", …" : ""}`);
      }

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

  // Groq model chain: comma-separated in GROQ_MODEL, tried in order.
  const groqModels = (process.env.GROQ_MODEL || "openai/gpt-oss-120b,llama-3.3-70b-versatile")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

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
    const ai = new GoogleGenAI({ apiKey });
    for (const model of getGeminiModels()) {
      try {
        const timeoutMs = 8000;
        const genPromise = ai.models.generateContent({
          model,
          contents: prompt,
          config: { temperature: 0.2 },
        });
        const res = await Promise.race([
          genPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Gemini timeout (${timeoutMs}ms)`)), timeoutMs)
          ),
        ]);
        const text = (res.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
        const parsed = JSON.parse(text);
        return normalizeGeminiOutput(parsed, totalChapters);
      } catch (err: any) {
        console.warn(`[Gemini-Synth] Model ${model} gagal: ${err.message || String(err)}. Lanjut ke model berikut...`);
        if (
          err?.message?.includes("429") ||
          err?.message?.includes("RESOURCE_EXHAUSTED") ||
          err?.message?.includes("Quota exceeded") ||
          err?.message?.includes("timeout") ||
          err?.message?.includes("ETIMEDOUT")
        ) {
          console.log(`[Gemini-Synth] Kuota habis / timeout pada Gemini. Beralih langsung ke Groq fallback...`);
          break;
        }
      }
    }
  }

  // Groq model chain: try each model in order; continue on non-OK or error
  // (covers decommissioned models as well as rate limits).
  if (groqApiKey) {
    for (const groqModel of groqModels) {
      try {
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${groqApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: groqModel,
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

        if (groqRes.status === 429) {
          const errJson = await groqRes.json().catch(() => ({}));
          const waitMatch = errJson?.error?.message?.match(/in (\d+(?:\.\d+)?s)/);
          const waitSec = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) + 2 : 15;
          console.log(`[Groq-Synth] Model ${groqModel} rate-limited. Menunggu ${waitSec} detik...`);
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }

        console.warn(`[Groq-Synth] Model ${groqModel} gagal (HTTP ${groqRes.status}). Lanjut ke model berikut...`);
      } catch (e: any) {
        console.warn(`[Groq-Synth] Model ${groqModel} error: ${e.message || String(e)}. Lanjut ke model berikut...`);
      }
    }
  }

  throw new Error(`Semua provider LLM gagal untuk sintesis ${characterName}`);
}

/**
 * AI-powered lore extraction for a specific series or all series.
 * Parses Fandom wikitext via Gemini/Groq for descriptions, relationships, statuses, factions.
 * CONSUMES AI TOKENS — only triggered manually via API.
 */
async function runLoreSync(targetAnilistId?: number) {
  let mediaList: Array<{ id: string; anilistId: number; title: string; totalChapters: number; chapterNumberingSource: string; type: string }>;

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
      // AniList titles (romaji/english/synonyms) greatly improve wiki and
      // fallback-source matching, but the Media row only stores one title —
      // fetch the rest lazily (cached).
      let altSynonyms: string[] | null = null;
      const getAltSynonyms = async (): Promise<string[]> => {
        if (altSynonyms) return altSynonyms;
        try {
          const detail = await fetchMediaDetail(media.anilistId);
          altSynonyms = mediaTitleForms(detail);
        } catch {
          altSynonyms = [];
        }
        return altSynonyms;
      };

      // Resolve Fandom wiki
      const wikiSubdomain = await resolveFandomWikiSubdomain(media.title, await getAltSynonyms());

      const dbCharacters = await prisma.character.findMany({ where: { mediaId: media.id } });
      const allNamesList = dbCharacters.map((c) => c.name);

      // Full re-extract on every run: lore from a previously mis-resolved wiki
      // (e.g. "Bastard!!" manga lore sitting on the Bastard manhwa) must be
      // replaced, not preserved. Old rows are deleted before new ones are
      // written, so a "synced before" state never causes a skip.
      const maxCharsToSync = targetAnilistId ? 15 : 6;
      const pendingChars = dbCharacters.slice(0, maxCharsToSync);

      if (pendingChars.length === 0) {
        addLog(`[SKIP] ${media.title} tidak punya karakter — jalankan catalog sync dulu.`);
        globalState.completedSeries++;
        globalState.progress = Math.round((globalState.completedSeries / globalState.totalSeries) * 100);
        continue;
      }
      addLog(`[Lore Sync] ${media.title}: mengekstrak lore untuk ${pendingChars.length} karakter.`);

      for (const dbChar of pendingChars) {
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

        // Fallback source 2: Wikipedia / Kitsu text → same LLM parser.
        // Used when there is no Fandom wiki, or the wiki has no page for this
        // character. Keeping the same parser means temporal chapter-bounding is
        // enforced identically regardless of where the prose came from.
        if (!parsed) {
          try {
            const alt = await fetchAltCharacterText(
              media.title,
              dbChar.name,
              await getAltSynonyms(),
              media.type === "MANHWA" ? "MANHWA" : "MANGA",
            );
            if (alt && alt.text.length >= 200) {
              addLog(`[Lore Sync] ${dbChar.name}: memakai sumber alternatif (${alt.attribution}).`);
              const cleaned = cleanWikitextForLLM(alt.text, 8000);
              parsed = await parseCharacterWikitext(
                cleaned,
                dbChar.name,
                media.chapterNumberingSource,
                media.totalChapters,
              );
            }
          } catch {
            // fall through to synthesis
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
              // A re-sync overwrites rather than stacks: any existing line of
              // the same type on this unordered pair is removed first, then
              // the freshly parsed line is written.
              await prisma.relationship.deleteMany({
                where: {
                  mediaId: media.id,
                  relationType: r.relationType,
                  OR: [
                    { sourceCharacterId: dbChar.id, targetCharacterId: targetCharId },
                    { sourceCharacterId: targetCharId, targetCharacterId: dbChar.id },
                  ],
                },
              });
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
  const finishedAt = new Date().toISOString();
  globalState.isRunning = false;
  globalState.finishedAt = finishedAt;
  globalState.currentSeries = "";
  globalState.currentCharacter = "";
  globalState.progress = 100;
  if (globalState.syncMode === "catalog") {
    globalState.lastCatalogSync = finishedAt;
  } else if (globalState.syncMode === "lore") {
    globalState.lastLoreSync = finishedAt;
  }
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

  clearLogs();
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

  clearLogs();
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
// Background Daemon — runs Tier 1 (catalog) automatically + Tier 2 (lore) optionally
// ---------------------------------------------------------------------------

let daemonStarted = false;

/**
 * Background daemon that auto-runs catalog sync on startup + periodic intervals.
 * Tier 1 (catalog sync) always runs — NO AI token consumption.
 * Tier 2 (lore sync) runs only if ENABLE_AUTO_LORE_SYNC="true" — CONSUMES AI TOKENS.
 */
export function initBackgroundDaemon(intervalHours = 6) {
  if (daemonStarted) return;
  daemonStarted = true;

  const autoLoreSync = process.env.ENABLE_AUTO_LORE_SYNC === "true";
  const loreIntervalHours = parseInt(process.env.LORE_SYNC_INTERVAL_HOURS || "168", 10);

  addLog(`Background daemon aktif (catalog interval: ${intervalHours} jam). Tier 1 tanpa AI.${autoLoreSync ? ` Lore sync otomatis AKTIF setiap ${loreIntervalHours} jam (MEMAKAN TOKEN AI).` : " Lore sync manual (via admin panel)."}`);

  // Defer initial catalog run by 8 seconds
  setTimeout(() => {
    if (!globalState.isRunning) {
      addLog("Menjalankan catalog sync otomatis awal...");
      startCatalogSync();
    }
  }, 8000);

  // Periodic catalog interval (Tier 1 — no AI)
  setInterval(() => {
    if (!globalState.isRunning) {
      addLog(`Menjalankan catalog sync otomatis berkala (${intervalHours} jam)...`);
      startCatalogSync();
    }
  }, intervalHours * 60 * 60 * 1000);

  // Periodic lore sync interval (Tier 2 — AI tokens, opt-in only)
  if (autoLoreSync) {
    // Defer initial lore sync by 30 seconds (after first catalog sync starts)
    setTimeout(() => {
      if (!globalState.isRunning) {
        addLog("Menjalankan lore sync otomatis awal (AI-powered)...");
        startLoreSync();
      }
    }, 30000);

    setInterval(() => {
      if (!globalState.isRunning) {
        addLog(`Menjalankan lore sync otomatis berkala (${loreIntervalHours} jam, AI-powered)...`);
        startLoreSync();
      }
    }, loreIntervalHours * 60 * 60 * 1000);
  }
}
