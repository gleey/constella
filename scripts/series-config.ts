/**
 * Global catalog configuration.
 * Semua manhwa di tabel Media diproses otomatis — daftar series tidak hardcoded.
 * FANDOM_WIKI_OVERRIDES hanya hint subdomain (agar tidak perlu probing ulang);
 * seri baru tanpa override tetap didukung lewat resolveFandomWikiSubdomain().
 */

import { prisma } from "../src/lib/prisma";
import { resolveFandomWikiSubdomain } from "../src/lib/fandom";

export interface SeriesMapping {
  mediaId: string;
  anilistId: number;
  title: string;
  fandomWiki: string;
  mainCharacters: string[]; // hint prioritas pengayaan LLM (kosong = pilih otomatis)
}

/** Hint manual: anilistId → { fandomWiki, mainCharacters }. */
const FANDOM_WIKI_OVERRIDES: Record<number, { fandomWiki: string; mainCharacters?: string[] }> = {
  119257: {
    fandomWiki: "omniscient-readers-viewpoint",
    mainCharacters: ["Kim Dokja", "Yoo Joonghyuk", "Han Sooyoung", "Yoo Sangah", "Jung Heewon", "Lee Hyunsung", "Lee Gilyoung", "Shin Yoosung", "Lee Jihye"],
  },
  85143: {
    fandomWiki: "towerofgod",
    mainCharacters: ["Twenty-Fifth Baam", "Koon Aguero Agnis", "Rak Wraithraiser", "Rachel", "Ha Yuri Zahard", "Androssi Zahard", "Urek Mazino", "Khun Ran"],
  },
  144957: { // The World After the Fall (manhwa)
    fandomWiki: "the-world-after-the-fall",
    mainCharacters: ["Jaehwan", "Mino", "Chungho", "Yoonhwan", "Karlton", "Sirwen Armelt"],
  },
  117460: { // Overgeared
    fandomWiki: "overgeared",
    mainCharacters: ["Shin Youngwoo", "Yura", "Jishuka", "Huroi", "Vantner", "Pon", "Kraugel", "Piaro", "Khan"],
  },
  137280: { // I'm the Max-Level Newbie
    fandomWiki: "max-level-newbie",
    mainCharacters: ["Kang Jinhyuk", "Teresa de Laurentis", "Alice at the End of the World", "Judas", "An Hyunjin", "Elise de Laurentis"],
  },
  163824: { // Revenge of the Baskerville Bloodhound
    fandomWiki: "revenge-of-the-ironblooded-sword-hound",
    mainCharacters: ["Vikir Van Baskerville", "Hugo Le Baskerville", "Aiyen", "Pomerian Morg", "Camus Morg", "Sinclair"],
  },
  153284: { // After Ten Millennia in Hell
    fandomWiki: "player-who-returned-10000-years-later",
    mainCharacters: ["Oh Kang Woo", "Han Seol-ah", "Kim Shi-hoon", "Echidna", "Cha Yeon-joo", "Baek Hwa-yeon"],
  },
  164857: {
    fandomWiki: "surviving-the-game-as-a-barbarian",
    mainCharacters: ["Bjorn Yandel", "Ainar", "Erwen Forn de Gavis", "Misha Karlstein", "Rotmiller", "Dwalki"],
  },
  175946: {
    fandomWiki: "myst-might-mayhem",
    mainCharacters: ["Mok Gyeong-un", "Cheon Yeo-woon", "Dan So-wol", "Baek Hyang-hwa"],
  },
  172619: {
    fandomWiki: "the-extras-academy-survival-guide",
    mainCharacters: ["Ed Rothtaylor", "Lucy Mayrill", "Yenika Faelorr", "Lortelle Keheln", "Taylee McLaure", "Princess Penia"],
  },
  // Titles whose Fandom subdomain differs substantially from the English title
  126297: { fandomWiki: "mercenary-enrollment" },        // Teenage Mercenary
  120980: { fandomWiki: "nano-mashine" },                 // Nano Machine
  118424: { fandomWiki: "the-great-mage" },               // The Archmage Returns After 4000 Years
  114605: { fandomWiki: "survival-story-of-a-sword-king-in-a-fantasy-world" }, // Latna Saga
  138222: { fandomWiki: "leveling-with-the-gods" },       // Level Up with the Gods
  132144: { fandomWiki: "return-of-the-mount-hua-sect" }, // Return of the Blossoming Blade
  149332: { fandomWiki: "swordmasters-youngest-son" },    // The Swordmaster's Son
  103156: { fandomWiki: "skeleton-soldier" },              // The Skeleton Soldier Failed to Defend the Dungeon
  38586:  { fandomWiki: "thebreaker" },                    // THE BREAKER
  52651:  { fandomWiki: "thebreaker" },                    // THE BREAKER - NEW WAVES
  87216:  { fandomWiki: "kimetsu-no-yaiba" },              // Demon Slayer: Kimetsu no Yaiba
  100994: { fandomWiki: "jigokuraku" },                    // Hell's Paradise: Jigokuraku
  117195: { fandomWiki: "oshinoko" },                      // [Oshi no Ko]
  31706:  { fandomWiki: "jojo" },                          // JoJo's Bizarre Adventure: Part 7
  150836: { fandomWiki: "academys-undercover-professor" }, // The Academy's Undercover Professor
  130511: { fandomWiki: "the-player-who-cant-level-up" },  // The Player Who Can't Level Up
  151512: { fandomWiki: "damn-reincarnation" },            // My Blasted Reincarnated Life
  104973: { fandomWiki: "raeliana" },                      // The Reason Why Raeliana Ended Up at the Duke's Mansion
  179445: { fandomWiki: "solo-leveling-ragnarok" },        // Solo Leveling: Ragnarok
  118408: { fandomWiki: "villains-are-destined-to-die" },  // also: death-is-the-only-ending-for-the-villainess
};

/**
 * Fetch AniList synonyms/romaji for a batch of AniList IDs.
 * Returns a map of anilistId → string[] (all alternate titles).
 */
async function fetchAniListSynonyms(ids: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  const BATCH = 40;
  const query = `
    query ($ids: [Int]) {
      Page(page: 1, perPage: 50) {
        media(id_in: $ids) {
          id
          title { romaji english }
          synonyms
        }
      }
    }
  `;

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    try {
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { ids: batch } }),
      });
      const json = await res.json();
      for (const m of json?.data?.Page?.media || []) {
        const titles: string[] = [];
        if (m.title?.romaji) titles.push(m.title.romaji);
        if (m.title?.english) titles.push(m.title.english);
        if (m.synonyms) titles.push(...m.synonyms);
        map.set(m.id, titles);
      }
    } catch (err: any) {
      console.warn(`[WIKI] Gagal fetch AniList synonyms batch ${i}: ${err.message}`);
    }
    if (i + BATCH < ids.length) await new Promise((r) => setTimeout(r, 350));
  }
  return map;
}

/**
 * Bangun konfigurasi untuk SEMUA media di database.
 * Seri baru otomatis ikut: subdomain wiki Fandom di-resolve dari judul + sinonim AniList.
 */
export async function buildSeriesConfigs(): Promise<SeriesMapping[]> {
  const medias = await prisma.media.findMany({ orderBy: { createdAt: "asc" } });

  // Pre-fetch AniList synonyms for media that don't have overrides
  const idsNeedingSynonyms = medias
    .filter((m) => !FANDOM_WIKI_OVERRIDES[m.anilistId]?.fandomWiki)
    .map((m) => m.anilistId);
  console.log(`[WIKI] Fetching AniList synonyms for ${idsNeedingSynonyms.length} media without overrides...`);
  const synonymsMap = await fetchAniListSynonyms(idsNeedingSynonyms);

  const configs: SeriesMapping[] = [];
  for (const media of medias) {
    const override = FANDOM_WIKI_OVERRIDES[media.anilistId];
    let fandomWiki = override?.fandomWiki ?? "";
    if (!fandomWiki) {
      const synonyms = synonymsMap.get(media.anilistId) || [];
      console.log(`[WIKI] Me-resolve subdomain Fandom untuk "${media.title}" (${synonyms.length} sinonim)...`);
      fandomWiki = (await resolveFandomWikiSubdomain(media.title, synonyms)) || "";
    }
    if (!fandomWiki) {
      console.warn(`[WIKI-WARN] Subdomain Fandom tidak ditemukan untuk "${media.title}". Cast Fandom dilewati.`);
    }
    configs.push({
      mediaId: media.id,
      anilistId: media.anilistId,
      title: media.title,
      fandomWiki,
      mainCharacters: override?.mainCharacters ?? [],
    });
  }
  return configs;
}

/** Deterministic faction palette (distinct on dark bg #0b0f19). */
export const FACTION_COLORS = [
  "#38bdf8", "#f472b6", "#34d399", "#fbbf24", "#a78bfa",
  "#fb7185", "#4ade80", "#f97316", "#22d3ee", "#c084fc",
  "#facc15", "#2dd4bf", "#60a5fa", "#e879f9", "#fda4af",
];

/** Deterministic string hash (djb2) for color assignment. */
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
