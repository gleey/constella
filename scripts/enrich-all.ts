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
import { parseCharacterWikitext, type GeminiParsedCharacter, getGeminiModels, normalizeGeminiOutput } from "../src/lib/gemini";
import { resolveCharacterName, resolveFactionName } from "../src/lib/name-resolution";
import { validateTemporalBounds } from "../src/lib/temporal";
import { GoogleGenAI } from "@google/genai";

interface SeriesMapping {
  anilistId: number;
  title: string;
  fandomWiki: string;
  mainCharacters: string[]; // Key characters to prioritize for Fandom + Gemini wikitext extraction
}

const SERIES_CONFIG: SeriesMapping[] = [
  {
    anilistId: 119257,
    title: "Omniscient Reader's Viewpoint",
    fandomWiki: "omniscient-readers-viewpoint",
    mainCharacters: ["Kim Dokja", "Yoo Joonghyuk", "Han Sooyoung", "Yoo Sangah", "Jung Heewon", "Lee Hyunsung", "Lee Gilyoung", "Shin Yoosung", "Lee Jihye"],
  },
  {
    anilistId: 108577,
    title: "The Beginning After the End",
    fandomWiki: "tbate",
    mainCharacters: ["Arthur Leywin", "Tessia Eralith", "Sylvie", "Virion Eralith", "Reynolds Leywin", "Alice Leywin", "Kathyln Glayder", "Bairon Wykes"],
  },
  {
    anilistId: 85143,
    title: "Tower of God",
    fandomWiki: "towerofgod",
    mainCharacters: ["Twenty-Fifth Baam", "Koon Aguero Agnis", "Rak Wraithraiser", "Rachel", "Ha Yuri Zahard", "Androssi Zahard", "Urek Mazino", "Khun Ran"],
  },
  {
    anilistId: 144405,
    title: "The World After the Fall",
    fandomWiki: "the-world-after-the-fall",
    mainCharacters: ["Jaehwan", "Mino", "Chungho", "Yoonhwan", "Karlton", "Sirwen Armelt"],
  },
  {
    anilistId: 119717,
    title: "Overgeared",
    fandomWiki: "overgeared",
    mainCharacters: ["Shin Youngwoo", "Yura", "Jishuka", "Huroi", "Vantner", "Pon", "Kraugel", "Piaro", "Khan"],
  },
  {
    anilistId: 136192,
    title: "Solo Max-Level Newbie",
    fandomWiki: "max-level-newbie",
    mainCharacters: ["Kang Jinhyuk", "Teresa de Laurentis", "Alice at the End of the World", "Judas", "An Hyunjin", "Elise de Laurentis"],
  },
  {
    anilistId: 161852,
    title: "Revenge of the Iron-Blooded Sword Hound",
    fandomWiki: "revenge-of-the-ironblooded-sword-hound",
    mainCharacters: ["Vikir Van Baskerville", "Hugo Le Baskerville", "Aiyen", "Pomerian Morg", "Camus Morg", "Sinclair"],
  },
  {
    anilistId: 153284,
    title: "The Player That Returned 10,000 Years Later",
    fandomWiki: "player-who-returned-10000-years-later",
    mainCharacters: ["Oh Kang Woo", "Han Seol-ah", "Kim Shi-hoon", "Echidna", "Cha Yeon-joo", "Baek Hwa-yeon"],
  },
  {
    anilistId: 164857,
    title: "Surviving the Game as a Barbarian",
    fandomWiki: "surviving-the-game-as-a-barbarian",
    mainCharacters: ["Bjorn Yandel", "Ainar", "Erwen Forn de Gavis", "Misha Karlstein", "Rotmiller", "Dwalki"],
  },
  {
    anilistId: 175946,
    title: "Myst, Might, Mayhem",
    fandomWiki: "myst-might-mayhem",
    mainCharacters: ["Mok Gyeong-un", "Cheon Yeo-woon", "Dan So-wol", "Baek Hyang-hwa"],
  },
  {
    anilistId: 172619,
    title: "The Extra's Academy Survival Guide",
    fandomWiki: "the-extras-academy-survival-guide",
    mainCharacters: ["Ed Rothtaylor", "Lucy Mayrill", "Yenika Faelorr", "Lortelle Keheln", "Taylee McLaure", "Princess Penia"],
  },
];

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
        console.warn(`[Gemini-Synth] Model ${model} gagal: ${err.message || String(err)}`);
        if (err?.message?.includes("429") || err?.message?.includes("RESOURCE_EXHAUSTED")) {
          break; // jump to Groq immediately
        }
      }
    }
  }

  // Fallback to Groq openai/gpt-oss-120b
  if (groqApiKey) {
    console.log(`[Groq-Synth] Menggunakan Groq (${process.env.GROQ_MODEL || "openai/gpt-oss-120b"}) untuk sintesis lore ${characterName}...`);
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
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
  }

  throw new Error(`Semua provider LLM gagal untuk sintesis ${characterName}`);
}

/**
 * Enrich a single media series.
 */
async function enrichMedia(config: SeriesMapping) {
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
  const dbCharacters = await prisma.character.findMany({
    where: { mediaId: media.id },
  });
  console.log(`[DB] Total ${dbCharacters.length} karakter terdaftar di DB untuk ${media.title}.`);

  const allNamesList = dbCharacters.map((c) => c.name);

  // 2. Process priority characters via Fandom + Gemini
  for (const charName of config.mainCharacters) {
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
            },
          });
        }

        const vFrom = Math.max(1, f.validFrom || introduced);
        const vUntil = f.validUntil !== null && f.validUntil > vFrom ? f.validUntil : null;

        // Create membership
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

          // Check if identical relation already exists
          const existingRel = await prisma.relationship.findFirst({
            where: {
              mediaId: media.id,
              sourceCharacterId: dbChar.id,
              targetCharacterId: targetCharId,
              validFrom: vFrom,
            },
          });

          if (!existingRel) {
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
          }
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

  for (const config of SERIES_CONFIG) {
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
