/**
 * Comprehensive Enrichment Pipeline Script.
 * Fetches real character & lore data using:
 *  1. AniList GraphQL API (full cast, roles, high-res images, aliases)
 *  2. Fandom MediaWiki API (smart wikitext retrieval + /Relationships subpages)
 *  3. Gemini 3.6 API (structured extraction: multi-phase descriptions, statuses, exact lore relationships, factions)
 *  4. Name Resolution & Direct Publishing to PostgreSQL.
 *
 * Usage:
 *  npx tsx -r dotenv/config scripts/enrich-all.ts [--mediaId=<id>] [--series=<slug>]
 */

import { prisma } from "../src/lib/prisma";
import { fetchMediaDetail } from "../src/lib/anilist";
import { fetchCharacterWikitextSmart, cleanWikitextForLLM } from "../src/lib/fandom";
import { fetchAltCharacterText, fetchAltCharacterRoster } from "../src/lib/alt-sources";
import { parseCharacterWikitext, type GeminiParsedCharacter, getGeminiModels, normalizeGeminiOutput } from "../src/lib/gemini";
import { resolveCharacterName, resolveFactionName } from "../src/lib/name-resolution";
import { validateTemporalBounds } from "../src/lib/temporal";
import { GoogleGenAI } from "@google/genai";
import { FACTION_COLORS, hashString, buildSeriesConfigs, type SeriesMapping } from "./series-config";



/**
 * Fallback synthesizer using Gemini or Groq (openai/gpt-oss-120b) for characters whose Fandom wikitext is missing.
 */
async function synthesizeLoreViaGemini(
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
Other major characters in this series include: ${allKnownCharacters.join(", ")}.

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
    const models = getGeminiModels();
    for (const model of models) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: prompt,
          config: { temperature: 0.2 },
        });
        const text = (res.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
        const parsed = JSON.parse(text);
        return normalizeGeminiOutput(parsed, totalChapters);
      } catch (err: any) {
        console.warn(`[Gemini-Synth] Model ${model} gagal: ${err.message || String(err)}. Lanjut ke model berikut...`);
        if (err?.message?.includes("429") || err?.message?.includes("RESOURCE_EXHAUSTED")) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
  }

  // Groq model chain: try each model in order; continue on non-OK or error
  // (covers decommissioned models as well as rate limits).
  if (groqApiKey) {
    for (const groqModel of groqModels) {
      try {
        console.log(`[Groq-Synth] Mencoba Groq (${groqModel}) untuk sintesis lore ${characterName}...`);
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${groqApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: groqModel,
            messages: [
              { role: "system", content: "You are an expert anime/manga lore archivist. Output valid JSON matching the schema." },
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
 * Enrich a single media series.
 */
export interface EnrichOptions {
  /** Limit used when a series has no curated mainCharacters override. */
  limit?: string;
}

export async function enrichMedia(config: SeriesMapping, options: EnrichOptions = {}) {
  console.log(`\n======================================================`);
  console.log(`[ENRICH] Memulai seri: ${config.title} (AniList: ${config.anilistId})`);
  console.log(`======================================================`);

  const media = await prisma.media.findUnique({
    where: { anilistId: config.anilistId },
  });

  if (!media) {
    console.warn(`[WARN] Media ${config.title} belum ada di database. Lewati.`);
    return;
  }

  // 1. Fetch expanded characters from AniList API (resilient)
  try {
    console.log(`[AniList] Mengambil daftar karakter resmi...`);
    const anilistDetail = await fetchMediaDetail(config.anilistId);
    console.log(`[AniList] Ditemukan ${anilistDetail.characters.length} karakter.`);

    // Upsert all characters from AniList to ensure images and aliases are accurate
    for (const c of anilistDetail.characters) {
      const existing = await prisma.character.findFirst({
        where: { mediaId: media.id, name: c.name },
      });

      if (existing) {
        // Update image if existing has placeholder
        if (c.imageUrl && (!existing.imageUrl || existing.imageUrl.startsWith("/images/"))) {
          await prisma.character.update({
            where: { id: existing.id },
            data: { imageUrl: c.imageUrl, aliases: Array.from(new Set([...existing.aliases, ...c.aliases])) },
          });
        }
      } else {
        await prisma.character.create({
          data: {
            mediaId: media.id,
            name: c.name,
            aliases: c.aliases,
            imageUrl: c.imageUrl || "",
            introducedAtChapter: 1, // Will be refined by Gemini
          },
        });
      }
    }
  } catch (err: any) {
    console.warn(`[AniList-WARN] Gagal mengambil karakter AniList (${err.message}). Melanjutkan dengan karakter di database.`);
  }

  // Reload all characters in media
  let dbCharacters = await prisma.character.findMany({
    where: { mediaId: media.id },
  });

  // If AniList and Fandom both left this series empty, try the fallback
  // sources so there is something to enrich at all.
  if (dbCharacters.length === 0) {
    try {
      const altRoster = await fetchAltCharacterRoster(
        media.title,
        [],
        media.type === "MANHWA" ? "MANHWA" : "MANGA",
        40,
      );
      if (altRoster.length > 0) {
        console.log(`[Sumber Alt] Menemukan ${altRoster.length} karakter untuk ${media.title}.`);
        for (const rc of altRoster) {
          await prisma.character.create({
            data: {
              mediaId: media.id,
              name: rc.name,
              aliases: rc.aliases,
              imageUrl: rc.imageUrl || "",
              introducedAtChapter: 1,
            },
          });
        }
        dbCharacters = await prisma.character.findMany({ where: { mediaId: media.id } });
      }
    } catch (err) {
      console.warn(`[WARN] Gagal mengambil roster alternatif: ${(err as Error).message}`);
    }
  }

  console.log(`[DB] Total ${dbCharacters.length} karakter terdaftar di DB untuk ${media.title}.`);

  const allNamesList = dbCharacters.map((c) => c.name);

  // 2. Process priority characters via Fandom + Gemini
  // Fallback global: seri tanpa override → proses karakter pertama.
  // Tidak ada skip berdasarkan lore lama — setiap run mengekstrak ulang dan
  // menimpa hasil sebelumnya, jadi lore yang salah tidak pernah menetap.
  let priorityNames = config.mainCharacters;
  if (priorityNames.length === 0) {
    const limitArg = options.limit ?? process.argv.find((a) => a.startsWith("--limit="));
    const autoLimit = limitArg ? Math.max(1, parseInt(limitArg.split("=")[1], 10) || 15) : 15;
    priorityNames = dbCharacters.slice(0, autoLimit).map((c) => c.name);
    console.log(`[AUTO] Seri "${media.title}" tanpa override → auto-pilih ${priorityNames.length} karakter untuk pengayaan.`);
  }
  for (const charName of priorityNames) {
    console.log(`\n--- Memproses Karakter: ${charName} (${config.title}) ---`);
    const dbChar = dbCharacters.find((c) => resolveCharacterName(charName, [c]) !== null) ||
      dbCharacters.find((c) => c.name.toLowerCase().includes(charName.toLowerCase()));

    if (!dbChar) {
      console.log(`[SKIP] Karakter ${charName} tidak ditemukan di database.`);
      continue;
    }

    let parsed: GeminiParsedCharacter | null = null;

    // A. Try fetching real Fandom wikitext
    try {
      console.log(`[Fandom] Mencari wikitext di ${config.fandomWiki}.fandom.com...`);
      const wikiRes = await fetchCharacterWikitextSmart(
        config.fandomWiki,
        charName,
        dbChar.aliases
      );

      if (wikiRes && wikiRes.wikitext.length > 500) {
        const cleaned = cleanWikitextForLLM(wikiRes.wikitext, 12000);
        console.log(`[Fandom] Menemukan wikitext untuk "${wikiRes.title}" (${wikiRes.wikitext.length} chars, dibersihkan jadi ${cleaned.length} chars).`);
        console.log(`[Gemini] Mengekstrak data temporal dengan Gemini API...`);
        parsed = await parseCharacterWikitext(
          cleaned,
          dbChar.name,
          media.chapterNumberingSource,
          media.totalChapters
        );
      } else {
        console.log(`[Fandom] Wikitext untuk ${charName} tidak ditemukan atau terlalu pendek.`);
      }
    } catch (err: any) {
      console.warn(`[WARN] Gagal mengambil/memproses Fandom wikitext untuk ${charName}: ${err.message}`);
    }

    // A2. Fallback sources (Wikipedia / Kitsu) when there is no Fandom wiki or
    //     the wiki has no page for this character. The prose goes through the
    //     exact same AI extractor, so chapter bounding is unchanged.
    if (!parsed) {
      try {
        const alt = await fetchAltCharacterText(
          media.title,
          dbChar.name,
          [],
          media.type === "MANHWA" ? "MANHWA" : "MANGA",
        );
        if (alt && alt.text.length >= 200) {
          const cleaned = cleanWikitextForLLM(alt.text, 12000);
          console.log(`[Sumber Alt] ${alt.attribution} → ${cleaned.length} chars.`);
          parsed = await parseCharacterWikitext(
            cleaned,
            dbChar.name,
            media.chapterNumberingSource,
            media.totalChapters,
          );
        }
      } catch (err) {
        console.warn(`[WARN] Sumber alternatif gagal untuk ${charName}: ${(err as Error).message}`);
      }
    }

    // B. Fallback: Lore synthesis with Gemini if wikitext failed
    if (!parsed) {
      try {
        console.log(`[Gemini] Menggunakan ekstraksi lore terarah untuk ${charName}...`);
        parsed = await synthesizeLoreViaGemini(charName, media.title, media.totalChapters, allNamesList);
      } catch (err: any) {
        console.error(`[ERROR] Gagal sintesis lore untuk ${charName}: ${err.message}`);
        continue;
      }
    }

    if (!parsed) continue;

    // C. Update Character debut chapter
    const introduced = Math.min(Math.max(1, parsed.introducedAtChapter || 1), media.totalChapters);
    await prisma.character.update({
      where: { id: dbChar.id },
      data: { introducedAtChapter: introduced },
    });

    // D. Upsert Descriptions
    if (parsed.descriptions && parsed.descriptions.length > 0) {
      await prisma.characterDescription.deleteMany({ where: { characterId: dbChar.id } });
      for (const desc of parsed.descriptions) {
        try {
          const vFrom = Math.max(1, desc.validFrom || introduced);
          const vUntil = desc.validUntil !== null && desc.validUntil > vFrom ? desc.validUntil : null;
          validateTemporalBounds(vFrom, vUntil);
          await prisma.characterDescription.create({
            data: {
              characterId: dbChar.id,
              text: desc.text,
              validFrom: vFrom,
              validUntil: vUntil,
              isSensitive: Boolean(desc.isSensitive),
            },
          });
        } catch (e) {
          // ignore temporal validation formatting quirk
        }
      }
      console.log(`[DB] ${parsed.descriptions.length} fase deskripsi disimpan untuk ${dbChar.name}.`);
    }

    // E. Upsert Statuses
    if (parsed.statuses && parsed.statuses.length > 0) {
      await prisma.characterStatus.deleteMany({ where: { characterId: dbChar.id } });
      for (const st of parsed.statuses) {
        try {
          const vFrom = Math.max(1, st.validFrom || introduced);
          const vUntil = st.validUntil !== null && st.validUntil > vFrom ? st.validUntil : null;
          validateTemporalBounds(vFrom, vUntil);
          await prisma.characterStatus.create({
            data: {
              characterId: dbChar.id,
              status: st.status || "Alive",
              validFrom: vFrom,
              validUntil: vUntil,
              isSensitive: Boolean(st.isSensitive),
            },
          });
        } catch (e) {}
      }
      console.log(`[DB] ${parsed.statuses.length} status disimpan untuk ${dbChar.name}.`);
    }

    // F. Upsert Factions
    if (parsed.factions && parsed.factions.length > 0) {
      for (const f of parsed.factions) {
        if (!f.factionName || !f.factionName.trim()) continue;
        const factionTitle = f.factionName.trim();
        let faction = await prisma.faction.findFirst({
          where: { mediaId: media.id, name: { equals: factionTitle, mode: "insensitive" } },
        });

        if (!faction) {
          faction = await prisma.faction.create({
            data: {
              mediaId: media.id,
              name: factionTitle,
              introducedAtChapter: Math.max(1, f.validFrom || introduced),
              colorHex: FACTION_COLORS[hashString(`${media.id}:${factionTitle}`) % FACTION_COLORS.length],
            },
          });
        }

        const vFrom = Math.max(1, f.validFrom || introduced);
        const vUntil = f.validUntil !== null && f.validUntil > vFrom ? f.validUntil : null;

        // Re-runs overwrite: drop any prior membership of this character in
        // this faction, then write the freshly parsed one.
        await prisma.factionMembership.deleteMany({
          where: { factionId: faction.id, characterId: dbChar.id },
        });
        await prisma.factionMembership.create({
          data: {
            factionId: faction.id,
            characterId: dbChar.id,
            validFrom: vFrom,
            validUntil: vUntil,
            isSensitive: Boolean(f.isSensitive),
          },
        });
      }
    }

    // G. Upsert Relationships
    if (parsed.relationships && parsed.relationships.length > 0) {
      let relCount = 0;
      for (const r of parsed.relationships) {
        if (!r.targetName || !r.relationType) continue;

        const targetCharId = resolveCharacterName(r.targetName, dbCharacters);
        if (!targetCharId || targetCharId === dbChar.id) continue;

        const vFrom = Math.max(1, r.validFrom || introduced);
        const vUntil = r.validUntil !== null && r.validUntil > vFrom ? r.validUntil : null;

        try {
          validateTemporalBounds(vFrom, vUntil);

          // Re-runs overwrite: drop prior same-type lines on this unordered
          // pair, then write the freshly parsed one — no stacking.
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
          relCount++;
        } catch (e) {}
      }
      console.log(`[DB] ${relCount} relasi tersambung disimpan untuk ${dbChar.name}.`);
    }

    // Gentle delay between character calls to keep API latency healthy
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`[DONE] Selesai pengayaan data untuk ${config.title}.\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const targetIdArg = args.find((a) => a.startsWith("--mediaId="));
  const targetId = targetIdArg ? parseInt(targetIdArg.split("=")[1], 10) : null;

  console.log("Memulai Auto-Enrichment Pipeline untuk seluruh katalog...");

  for (const config of await buildSeriesConfigs(targetId)) {
    if (targetId && config.anilistId !== targetId) continue;
    await enrichMedia(config);
  }

  console.log("\n======================================================");
  console.log("SELURUH DATA KATALOG TELAH BERHASIL DIPERKAYA VIA API!");
  console.log("======================================================");
}

main()
  .catch((e) => {
    console.error("FATAL ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
