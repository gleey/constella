/**
 * Chapter-count resolution shared by every sync path.
 *
 * The problem this solves: AniList reports `chapters: null` for series that
 * are still releasing, so the catalog used to fall back to a static 100. A
 * series with 600 chapters then looked like it had 100, which made every
 * temporal bound derived from `totalChapters` wrong (a character debuting in
 * chapter 400 was considered "not yet introduced").
 *
 * Resolution order:
 *   1. AniList `chapters` — authoritative for finished series.
 *   2. Kitsu / MangaUpdates live count — for ongoing series.
 *   3. The previous stored value — never shrink below what we already know.
 *   4. A floor of 100 — only as a last resort, so downstream math still has a
 *      sane denominator instead of dividing by zero.
 */

import { fetchLiveMangaInfo } from "./live-chapters";
import { mediaTitleForms } from "./anilist";

/** Minimum assumed length when nothing better is known. */
export const FALLBACK_TOTAL_CHAPTERS = 100;

export interface ResolvedChapterCount {
  totalChapters: number;
  /** Where the number came from, for logging. */
  source: "anilist" | "live" | "existing" | "fallback";
}

/**
 * Resolve the chapter count for a series.
 *
 * `previousTotal` is the value already in the database — it is used as a floor
 * so a transient lookup failure never shrinks a known-good count.
 */
export async function resolveTotalChapters(
  detail: {
    id: number;
    title: string;
    chapters?: number | null;
    countryOfOrigin?: string | null;
    romajiTitle?: string | null;
    englishTitle?: string | null;
    synonyms?: string[] | null;
  },
  previousTotal?: number | null,
): Promise<ResolvedChapterCount> {
  const anilistChapters = detail.chapters && detail.chapters > 0 ? detail.chapters : null;
  if (anilistChapters) {
    return { totalChapters: anilistChapters, source: "anilist" };
  }

  // Ongoing (or AniList simply has no number): ask the live sources.
  try {
    const live = await fetchLiveMangaInfo(
      detail.title,
      detail.id,
      mediaTitleForms(detail),
      detail.countryOfOrigin === "KR" ? "MANHWA" : "MANGA",
    );
    if (live?.chapters && live.chapters > 0) {
      return { totalChapters: live.chapters, source: "live" };
    }
  } catch {
    // fall through to the stored value
  }

  // Keep what we already knew rather than regressing to the placeholder.
  if (previousTotal && previousTotal > 0 && previousTotal !== FALLBACK_TOTAL_CHAPTERS) {
    return { totalChapters: previousTotal, source: "existing" };
  }

  return { totalChapters: FALLBACK_TOTAL_CHAPTERS, source: "fallback" };
}
