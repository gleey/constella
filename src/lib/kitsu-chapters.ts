/**
 * Kitsu as a live chapter-count source.
 *
 * Why Kitsu and not MangaDex/Jikan:
 *   - MangaDex hangs on IPv6 from this deployment, but responds over IPv4 —
 *     it is now wired in as the MangaUpdates outage fallback (mangadex.ts),
 *     called through the same IPv4-forced transport as live-chapters.ts.
 *   - Jikan times out here, and its data is a MAL mirror — mostly a
 *     duplicate of AniList.
 *   - Kitsu is already a proven source in this project (alt-sources.ts), and
 *     it exposes BOTH a `chapterCount` that is kept current for ongoing
 *     series AND a `mappings` record carrying the AniList id.
 *
 * The mapping is the important part: `externalSite: "anilist/manga"` with the
 * AniList id lets us resolve a series EXACTLY, instead of guessing by title
 * the way MangaUpdates does (which is prone to false positives — novels, older
 * works with the same name, spin-offs).
 */

import { cacheGet, cacheSet } from "./api-cache";

const KITSU_API = "https://kitsu.io/api/edge";
const KITSU_HEADERS = {
  "User-Agent": "SpoilerFreeMap/1.0 (character-data research; +https://github.com/gleey/constella)",
  Accept: "application/vnd.api+json",
};

const KITSU_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

export interface KitsuChapterInfo {
  chapters: number | null;
  status: "RELEASING" | "FINISHED" | "CANCELLED" | "HIATUS" | null;
  /** Kitsu media id, kept so callers can reuse the entry. */
  kitsuId: string;
}

interface KitsuAttributes {
  chapterCount?: number | null;
  status?: unknown;
  subtype?: unknown;
  canonicalTitle?: unknown;
}

interface KitsuMediaEntry {
  id: string;
  attributes?: KitsuAttributes;
}

interface KitsuMappingEntry {
  attributes?: {
    externalSite?: string;
    externalId?: unknown;
  };
}

async function fetchJson<T = unknown>(url: string, timeoutMs = 8000): Promise<T | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: KITSU_HEADERS, signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeStatus(raw: unknown): KitsuChapterInfo["status"] {
  const s = String(raw || "").toLowerCase();
  if (s === "finished" || s === "completed") return "FINISHED";
  if (s === "current" || s === "ongoing" || s === "releasing" || s === "publishing") return "RELEASING";
  if (s === "hiatus") return "HIATUS";
  if (s === "cancelled") return "CANCELLED";
  return null;
}

function toInfo(id: string, attributes?: KitsuAttributes): KitsuChapterInfo {
  const count = attributes?.chapterCount;
  return {
    chapters: typeof count === "number" && count > 0 ? count : null,
    status: normalizeStatus(attributes?.status),
    kitsuId: id,
  };
}

/**
 * Verify that a Kitsu entry is the same work as the given AniList id, using
 * Kitsu's `anilist/manga` mapping record. This is what turns a title search
 * into an exact match: the mapping is an explicit, curated cross-reference.
 *
 * Kitsu does not allow filtering by mappings, so the check is per-candidate.
 */
export async function verifyKitsuAniListMapping(
  kitsuId: string,
  anilistId: number,
): Promise<boolean> {
  const cacheKey = `kitsu:mapping:${kitsuId}:${anilistId}`;
  // Wrapped in an object so a cached `false` is distinguishable from a miss
  // (the shared cache returns null for "not cached").
  const cached = cacheGet<{ matched: boolean }>(cacheKey);
  if (cached) return cached.matched;

  const mapping = await fetchJson<{ data?: KitsuMappingEntry[] }>(
    `${KITSU_API}/manga/${kitsuId}/mappings?page[limit]=25`,
  );
  const matched = (mapping?.data ?? []).some(
    (m) =>
      m?.attributes?.externalSite === "anilist/manga" &&
      String(m?.attributes?.externalId) === String(anilistId),
  );
  cacheSet(cacheKey, { matched }, KITSU_CACHE_TTL);
  return matched;
}

/**
 * Resolve a series' Kitsu entry by title, restricted to manga-family
 * publications, and verified against the AniList id when one is supplied.
 */
export async function findKitsuChapterInfo(
  title: string,
  titleForms: string[] = [],
  anilistId?: number,
  expectedType: "MANGA" | "MANHWA" | "UNKNOWN" = "UNKNOWN",
): Promise<KitsuChapterInfo | null> {
  const forms = [title, ...titleForms]
    .map((t) => (t || "").trim())
    .filter(Boolean);
  if (forms.length === 0) return null;

  const cacheKey = `kitsu:resolve:${expectedType}:${anilistId ?? ""}:${forms[0].toLowerCase()}`;
  const cached = cacheGet<KitsuChapterInfo>(cacheKey);
  if (cached) return cached;

  const subtypeAllowed = (subtype: unknown): boolean => {
    const s = String(subtype || "").toLowerCase();
    if (expectedType === "MANHWA") return s === "manhwa" || s === "manhua";
    if (expectedType === "MANGA") return s === "manga" || s === "oneshot";
    return s === "manga" || s === "manhwa" || s === "manhua" || s === "oneshot";
  };

  const normalizedForms = forms.map((f) => f.toLowerCase());

  // Collect candidates across the known title forms, keeping only entries of
  // the right publication type whose title actually resembles the series.
  const candidates: KitsuMediaEntry[] = [];
  for (const form of forms.slice(0, 3)) {
    const json = await fetchJson<{ data?: KitsuMediaEntry[] }>(
      `${KITSU_API}/manga?filter[text]=${encodeURIComponent(form)}&page[limit]=5`,
    );
    for (const entry of json?.data ?? []) {
      if (!subtypeAllowed(entry?.attributes?.subtype)) continue;
      const canonical = String(entry?.attributes?.canonicalTitle || "").toLowerCase();
      if (!normalizedForms.some((f) => f === canonical)) continue;
      if (!candidates.some((c) => c.id === entry.id)) candidates.push(entry);
    }
    if (candidates.length > 0) break;
  }

  if (candidates.length === 0) {
    cacheSet(cacheKey, null, KITSU_CACHE_TTL);
    return null;
  }

  // With an AniList id available, prefer an entry whose mapping confirms the
  // identity — exact, and immune to same-name works.
  if (anilistId) {
    for (const entry of candidates) {
      if (await verifyKitsuAniListMapping(entry.id, anilistId)) {
        const info = toInfo(entry.id, entry.attributes);
        cacheSet(cacheKey, info, KITSU_CACHE_TTL);
        return info;
      }
    }
  }

  // Otherwise take the candidate that actually carries a chapter count.
  const best =
    candidates.find((c) => toInfo(c.id, c.attributes).chapters !== null) ?? candidates[0];
  const info = toInfo(best.id, best.attributes);
  cacheSet(cacheKey, info, KITSU_CACHE_TTL);
  return info;
}
