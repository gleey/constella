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
  108577: {
    fandomWiki: "tbate",
    mainCharacters: ["Arthur Leywin", "Tessia Eralith", "Sylvie", "Virion Eralith", "Reynolds Leywin", "Alice Leywin", "Kathyln Glayder", "Bairon Wykes"],
  },
  85143: {
    fandomWiki: "towerofgod",
    mainCharacters: ["Twenty-Fifth Baam", "Koon Aguero Agnis", "Rak Wraithraiser", "Rachel", "Ha Yuri Zahard", "Androssi Zahard", "Urek Mazino", "Khun Ran"],
  },
  144405: {
    fandomWiki: "the-world-after-the-fall",
    mainCharacters: ["Jaehwan", "Mino", "Chungho", "Yoonhwan", "Karlton", "Sirwen Armelt"],
  },
  119717: {
    fandomWiki: "overgeared",
    mainCharacters: ["Shin Youngwoo", "Yura", "Jishuka", "Huroi", "Vantner", "Pon", "Kraugel", "Piaro", "Khan"],
  },
  136192: {
    fandomWiki: "max-level-newbie",
    mainCharacters: ["Kang Jinhyuk", "Teresa de Laurentis", "Alice at the End of the World", "Judas", "An Hyunjin", "Elise de Laurentis"],
  },
  161852: {
    fandomWiki: "revenge-of-the-ironblooded-sword-hound",
    mainCharacters: ["Vikir Van Baskerville", "Hugo Le Baskerville", "Aiyen", "Pomerian Morg", "Camus Morg", "Sinclair"],
  },
  153284: {
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
};

/**
 * Bangun konfigurasi untuk SEMUA media di database.
 * Seri baru otomatis ikut: subdomain wiki Fandom di-resolve dari judul.
 */
export async function buildSeriesConfigs(): Promise<SeriesMapping[]> {
  const medias = await prisma.media.findMany({ orderBy: { createdAt: "asc" } });
  const configs: SeriesMapping[] = [];
  for (const media of medias) {
    const override = FANDOM_WIKI_OVERRIDES[media.anilistId];
    let fandomWiki = override?.fandomWiki ?? "";
    if (!fandomWiki) {
      console.log(`[WIKI] Me-resolve subdomain Fandom untuk "${media.title}"...`);
      fandomWiki = (await resolveFandomWikiSubdomain(media.title)) || "";
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
