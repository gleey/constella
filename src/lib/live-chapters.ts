import https from "node:https";
import { prisma } from "./prisma";
import { cacheGet, cacheSet } from "./api-cache";
import { findKitsuChapterInfo } from "./kitsu-chapters";
import { findMangaDexInfo } from "./mangadex";

// In-memory cache for live manga info to prevent redundant queries
export type MediaReleaseStatus = "RELEASING" | "FINISHED" | "CANCELLED" | "HIATUS";

export interface LiveMangaData {
  chapters: number | null;
  status: MediaReleaseStatus | null;
}

const liveMangaCache = new Map<string, { data: LiveMangaData; timestamp: number }>();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * MangaUpdates circuit breaker.
 *
 * The API sits behind an nginx proxy that answers 504 after a 60s gateway
 * timeout when the upstream is unhealthy. A catalog sync touches hundreds of
 * titles, so without a breaker a single outage stalls the whole run for
 * hours. After a few consecutive failures we stop calling it for a cooldown
 * and fall back to Kitsu (which is a separate host and stays up).
 */
const MU_FAILURE_THRESHOLD = 3;
const MU_COOLDOWN_MS = 10 * 60 * 1000;
let muConsecutiveFailures = 0;
let muDisabledUntil = 0;

function mangaUpdatesAvailable(): boolean {
  return Date.now() >= muDisabledUntil;
}

function noteMangaUpdatesFailure(): void {
  muConsecutiveFailures += 1;
  if (muConsecutiveFailures >= MU_FAILURE_THRESHOLD) {
    muDisabledUntil = Date.now() + MU_COOLDOWN_MS;
    muConsecutiveFailures = 0;
    console.warn(
      `[live-chapters] MangaUpdates unreachable ${MU_FAILURE_THRESHOLD}× — disabling for ${MU_COOLDOWN_MS / 60000} min, falling back to Kitsu.`,
    );
  }
}

function noteMangaUpdatesSuccess(): void {
  muConsecutiveFailures = 0;
}

function requestIPv4(url: string, options: { method?: string; body?: string; headers?: Record<string, string> } = {}) {
  return new Promise<{ ok: boolean; status: number; json: () => Promise<any> }>((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: options.method || "GET",
        family: 4,
        headers: {
          "User-Agent": "Constella/1.0",
          ...options.headers,
        },
        timeout: 10000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          resolve({
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
            status: res.statusCode ?? 0,
            json: async () => JSON.parse(body),
          });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("MangaUpdates request timed out")));
    if (options.body) req.write(options.body);
    req.end();
  });
}

/**
 * Extract the series-wide chapter count from a MangaUpdates detail record.
 *
 * MangaUpdates packs several different numbers into `status`:
 *   "652 Chapters (Ongoing)\n20 Volumes (Ongoing)\n\nS1: 78 Chapters + Prologue"
 * Only the first is the total length of the work — the rest are per-season
 * slices, so matching "(\d+) Chapters" against the whole string picks up
 * whichever season line happens to appear first ("Red Storm" reported 20
 * chapters instead of its actual 400+).
 *
 * When no series-wide number exists (the status is a season breakdown) we
 * fall back to `latest_chapter`, which is the highest chapter number reached
 * and therefore the closest available approximation of the total.
 */
function parseChapterFromDetail(detail: any): number | null {
  if (!detail) return null;
  const status: string = detail.status || "";

  const topLevelLines = status.split("\n").filter((line) => {
    const t = line.trim();
    if (!t) return false;
    // Per-season / per-part breakdowns describe a slice, not the whole.
    if (/^(part|season)\b/i.test(t)) return false;
    if (/^s\d+\s*:/i.test(t)) return false;
    // Range lines ("1~20") also describe a slice.
    if (t.includes("~")) return false;
    return true;
  });

  const chaptersMatch = topLevelLines.join(" ").match(/(\d+)\s+Chapters/i);
  if (chaptersMatch && parseInt(chaptersMatch[1], 10) > 0) {
    return parseInt(chaptersMatch[1], 10);
  }

  if (typeof detail.latest_chapter === "number" && detail.latest_chapter > 0) {
    return detail.latest_chapter;
  }

  return null;
}

export function parseStatusFromDetail(detail: any): MediaReleaseStatus | null {
  if (!detail) return null;
  const statusStr: string = detail.status || "";
  const firstLine = statusStr.split("\n")[0] || "";

  // 1. Cancelled / Discontinued / Dropped
  if (/\b(Discontinued|Cancelled|Dropped)\b/i.test(firstLine)) {
    return "CANCELLED";
  }

  // 2. Completed / Finished
  if (detail.completed === true || /\b(Complete|Finished)\b/i.test(firstLine)) {
    // If first line explicitly indicates Ongoing without Complete (e.g. ongoing side stories or ongoing print)
    if (/\bOngoing\b/i.test(firstLine) && !/\b(Complete|Finished)\b/i.test(firstLine)) {
      return "RELEASING";
    }
    return "FINISHED";
  }

  // 3. Hiatus
  if (/\bHiatus\b/i.test(firstLine)) {
    return "HIATUS";
  }

  // 4. Ongoing
  if (/\bOngoing\b/i.test(firstLine)) {
    return "RELEASING";
  }

  return null;
}

/**
 * Pick the best MangaUpdates record for a series.
 *
 * MangaUpdates search returns loosely-related hits, so a naive "first non-novel
 * record" is wrong: searching "Bastard" returns the *Bastard!!* manga first
 * and "Bastard King" second, while the manhwa we want is not listed at all.
 *
 * Two guards keep this honest:
 *   1. the record's type must match the expected publication type
 *      (MangaUpdates files most webtoons as "Manhwa" or "OEL"), and
 *   2. the title must match one of the known title forms exactly, after
 *      normalising case/punctuation and stripping a generic publication
 *      suffix ("Solo Leveling (Manhwa)" ≡ "Solo Leveling").
 *
 * When no type-compatible, title-compatible record exists we return null
 * rather than guess: a wrong chapter count silently corrupts every temporal
 * bound derived from it.
 */
function pickMangaUpdatesRecord(
  results: Array<{ record?: any }>,
  titleForms: string[],
  expectedType: "MANGA" | "MANHWA" | "UNKNOWN",
): any | null {
  const records = results.map((r) => r?.record).filter((r) => r && r.series_id);
  if (records.length === 0) return null;

  const typeMatches = (type: unknown): boolean => {
    const t = String(type || "").toLowerCase();
    if (t === "novel") return false;
    if (expectedType === "MANHWA") return t === "manhwa" || t === "manhua" || t === "oel";
    if (expectedType === "MANGA") return t === "manga";
    return t === "manga" || t === "manhwa" || t === "manhua" || t === "oel";
  };

  const GENERIC_SUFFIXES = ["manhwa", "manhua", "manga", "webtoon", "webcomic", "comic", "official", "en"];

  const normalize = (s: unknown): string => {
    let n = String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    for (const suffix of GENERIC_SUFFIXES) {
      if (n.length > suffix.length && n.endsWith(suffix)) {
        n = n.slice(0, -suffix.length);
        break;
      }
    }
    return n;
  };

  const targets = new Set(
    titleForms
      .map((t) => normalize(t))
      .filter((t) => t.length > 0),
  );
  if (targets.size === 0) return null;

  const pool = records.filter((r) => typeMatches(r.type));
  if (pool.length === 0) return null;

  return pool.find((r) => targets.has(normalize(r.title))) || null;
}

/**
 * Resolve the live chapter count for a title.
 *
 * Two sources with complementary strengths:
 *   - Kitsu resolves identity EXACTLY through its `anilist/manga` mapping and
 *     knows the release status authoritatively. But its `chapterCount` is only
 *     as complete as Kitsu's own chapter catalogue — for "Kotoshi no
 *     Mitsuishi-san" it reports 3 while the series actually has 34 — so it
 *     is never trusted for the count on its own.
 *   - MangaUpdates tracks the latest published chapter for essentially every
 *     series, including ongoing ones where AniList reports `chapters: null`,
 *     and it publishes a series-wide total ("652 Chapters (Ongoing)") when
 *     one exists. Its identity check is a title match, so it is guarded by
 *     type and exact-title matching.
 *   - MangaDex is the outage fallback: when MangaUpdates yields nothing
 *     (breaker open during its 502/504 spells, or a search miss), MangaDex's
 *     `lastChapter` + `status` fill the gap with the same exact-title,
 *     type-checked, doujin-rejecting identity policy.
 *
 * Therefore: the count comes from MangaUpdates, then MangaDex, then Kitsu;
 * the status comes from Kitsu first (authoritative via its AniList mapping),
 * then MangaUpdates, then MangaDex.
 */
export async function fetchLiveMangaInfo(
  title: string,
  anilistId?: number,
  titleForms: string[] = [],
  expectedType: "MANGA" | "MANHWA" | "UNKNOWN" = "UNKNOWN",
): Promise<LiveMangaData | null> {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) return null;

  const cacheKey = `${normalizedTitle.toLowerCase()}::${anilistId ?? ""}`;
  const cached = liveMangaCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // 1. Kitsu — exact identity via the `anilist/manga` mapping; authoritative
  //    release status.
  let kitsuStatus: MediaReleaseStatus | null = null;
  let kitsuChapters: number | null = null;
  try {
    const kitsu = await findKitsuChapterInfo(
      normalizedTitle,
      titleForms,
      anilistId,
      expectedType,
    );
    if (kitsu) {
      kitsuStatus = kitsu.status;
      kitsuChapters = kitsu.chapters;
    }
  } catch {
    // fall through to MangaUpdates
  }

  // 2. MangaUpdates — the reliable chapter count for ongoing series.
  //    Skipped entirely while the circuit breaker is open (API outage).
  if (mangaUpdatesAvailable()) {
  try {
    const forms = [normalizedTitle, ...titleForms]
      .map((t) =>
        (t || "")
          .replace(/\s*\(.*?\)\s*/g, " ")
          .replace(/\s*\[.*?\]\s*/g, " ")
          .trim(),
      )
      .filter(Boolean);
    const uniqueForms = [...new Set(forms)];

    let bestRecord: any | null = null;
    // Query all title forms concurrently, then evaluate in original form order
    // so the exact/primary form keeps priority over looser synonyms.
    const searchResponses = await Promise.all(
      uniqueForms.map((form) =>
        requestIPv4("https://api.mangaupdates.com/v1/series/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ search: form, stype: "title" }),
        })
      )
    );

    for (const searchRes of searchResponses) {
      if (!searchRes.ok) {
        // 502/504 means the upstream is down — that is an outage, not a miss.
        noteMangaUpdatesFailure();
        if (!mangaUpdatesAvailable()) break;
        continue;
      }

      const searchData = await searchRes.json();
      const results = searchData?.results || [];
      if (!results.length) continue;

      bestRecord = pickMangaUpdatesRecord(results, uniqueForms, expectedType);
      if (bestRecord) break;
    }

    if (bestRecord?.series_id) {
      const detailRes = await requestIPv4(
        `https://api.mangaupdates.com/v1/series/${bestRecord.series_id}`,
      );
      if (detailRes.ok) {
        const detail = await detailRes.json();
        const chapters = parseChapterFromDetail(detail);
        const status = parseStatusFromDetail(detail) ?? kitsuStatus;
        noteMangaUpdatesSuccess();
        const data: LiveMangaData = {
          chapters: chapters ?? kitsuChapters,
          status,
        };
        liveMangaCache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      }
      noteMangaUpdatesFailure();
    } else {
      // A search that returns no usable record is a miss, not an outage.
      noteMangaUpdatesSuccess();
    }
  } catch (err) {
    noteMangaUpdatesFailure();
    console.warn(
      `[live-chapters] MangaUpdates lookup failed for "${title}":`,
      err instanceof Error ? err.message : err,
    );
  }
  }

  // 3. MangaDex — outage fallback for the live chapter count. Only consulted
  //    when MangaUpdates produced nothing (breaker open / search miss /
  //    detail failure): MangaUpdates stays the primary source whenever it is
  //    healthy. MangaDex's `lastChapter` is the closest public approximation
  //    of the live total for ongoing series, and its identity guard
  //    (exact title + language type + doujin rejection) matches the same
  //    "no confident match, no count" policy as the MangaUpdates picker.
  try {
    const md = await findMangaDexInfo(normalizedTitle, titleForms, expectedType);
    if (md && (md.chapters !== null || md.status !== null)) {
      const data: LiveMangaData = {
        chapters: md.chapters ?? kitsuChapters,
        status: kitsuStatus ?? md.status,
      };
      liveMangaCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    }
  } catch {
    // non-fatal — fall through to Kitsu only
  }

  // 4. Kitsu only.
  if (kitsuStatus || kitsuChapters !== null) {
    const data: LiveMangaData = { chapters: kitsuChapters, status: kitsuStatus };
    liveMangaCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  }

  return null;
}

/**
 * Searches Kitsu/MangaUpdates for the title and retrieves the actual live chapter count.
 */
export async function fetchLiveChapterCount(
  title: string,
  anilistId?: number,
  titleForms: string[] = [],
  expectedType: "MANGA" | "MANHWA" | "UNKNOWN" = "UNKNOWN",
): Promise<number | null> {
  const info = await fetchLiveMangaInfo(title, anilistId, titleForms, expectedType);
  return info?.chapters ?? null;
}

/**
 * Searches MangaUpdates for the title and retrieves the authoritative release status.
 */
export async function fetchLiveStatus(title: string): Promise<MediaReleaseStatus | null> {
  const info = await fetchLiveMangaInfo(title);
  return info?.status ?? null;
}

/**
 * Checks and updates a specific Media record with the live chapter count and release status.
 */
export async function syncMediaLiveChapters(mediaId: string): Promise<{ totalChapters: number; status: string } | null> {
  try {
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      select: { id: true, title: true, status: true, totalChapters: true },
    });

    if (!media) return null;

    const live = await fetchLiveMangaInfo(media.title);
    if (!live) return { totalChapters: media.totalChapters, status: media.status };

    const updateData: { totalChapters?: number } = {};

    if (live.chapters && live.chapters > 0 && live.chapters !== media.totalChapters) {
      updateData.totalChapters = live.chapters;
    }

    if (Object.keys(updateData).length > 0) {
      const updated = await prisma.media.update({
        where: { id: mediaId },
        data: updateData,
        select: { totalChapters: true, status: true },
      });
      return updated;
    }

    return { totalChapters: media.totalChapters, status: media.status };
  } catch (err) {
    console.error(`[live-chapters] Error syncing media ${mediaId}:`, err);
    return null;
  }
}
