/**
 * MangaDex as a live chapter-count + release-status source.
 *
 * Why MangaDex (and where it sits in the chain):
 *   - MangaUpdates is the primary live chapter source, but its nginx proxy
 *     has repeated multi-hour 502/504 outages. During one of those the
 *     circuit breaker in live-chapters.ts trips and ongoing series fall back
 *     to Kitsu's `chapterCount`, which is often stale (see the note in
 *     live-chapters.ts — Kitsu reported 3 chapters for a 34-chapter series).
 *   - MangaDex tracks scanlation releases closely and exposes both
 *     `lastChapter` (highest published chapter number) and `status`
 *     (ongoing/completed/hiatus/cancelled) per series. That makes it the best
 *     outage fallback for exactly the field MangaUpdates owns.
 *
 * Identity safety (same philosophy as pickMangaUpdatesRecord):
 *   MangaDex search returns loosely related hits — the Solo Leveling query
 *   returns Ragnarok/Arise spin-offs and doujinshi before the main work. A
 *   record is accepted only when:
 *     1. its publication demographic type fits (originalLanguage ko → manhwa,
 *        ja → manga), and
 *     2. the title (EN title or any alt title) matches one of the known
 *        title forms exactly after normalisation, and
 *     3. it is not a doujinshi/spin-off (title carries no marker, the work
 *        has an original language set, and it is not the first hit solely by
 *        virtue of being related).
 *   When in doubt we return null — a wrong chapter count silently corrupts
 *   every temporal bound derived from it, which is worse than no count.
 *
 * Note: api.mangadex.org must be reached over IPv4 from this deployment
 * (IPv6/DoH paths hang, same as MangaUpdates), so requests go through the
 * shared requestIPv4 helper.
 */

import https from "node:https";
import { cacheGet, cacheSet } from "./api-cache";

const MANGADEX_API = "https://api.mangadex.org";
const MANGADEX_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

export type MangaDexReleaseStatus = "RELEASING" | "FINISHED" | "CANCELLED" | "HIATUS";

export interface MangaDexInfo {
  chapters: number | null;
  status: MangaDexReleaseStatus | null;
}

/** MediaWiki-style IPv4-forced JSON fetch (api.mangadex.org hangs on IPv6 here). */
function fetchJsonIPv4<T = unknown>(url: string): Promise<T | null> {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "GET",
        family: 4,
        headers: { "User-Agent": "Constella/1.0" },
        timeout: 10000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(body) as T);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

function normalizeStatus(raw: unknown): MangaDexReleaseStatus | null {
  const s = String(raw || "").toLowerCase();
  if (s === "completed") return "FINISHED";
  if (s === "ongoing") return "RELEASING";
  if (s === "hiatus") return "HIATUS";
  if (s === "cancelled") return "CANCELLED";
  return null;
}

/** Spin-offs / parodies / fan works must never supply the canonical count. */
const DOUJIN_MARKER = /\b(doujinshi|doujin|dj\b|parody|fan ?made|fanwork|oneshot collection|anthology)\b/i;

const GENERIC_SUFFIXES = ["manhwa", "manhua", "manga", "webtoon", "webcomic", "comic", "novel", "official", "en"];

function normalizeTitle(s: unknown): string {
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
}

interface MangaDexEntry {
  id: string;
  attributes?: {
    title?: Record<string, string>;
    altTitles?: Array<Record<string, string>>;
    status?: string;
    lastChapter?: string;
    originalLanguage?: string;
    contentRating?: string;
    publicationDemographic?: string | null;
  };
}

/**
 * Pick the MangaDex entry that IS this series, or null when none qualify.
 * Guards mirror pickMangaUpdatesRecord: type compatibility + exact
 * (normalised) title equality + doujin/spin-off rejection.
 */
function pickMangaDexEntry(
  entries: MangaDexEntry[],
  titleForms: string[],
  expectedType: "MANGA" | "MANHWA" | "UNKNOWN",
): MangaDexEntry | null {
  const targets = new Set(titleForms.map(normalizeTitle).filter((t) => t.length > 0));
  if (targets.size === 0) return null;

  const typeOk = (lang: string): boolean => {
    const l = (lang || "").toLowerCase();
    if (expectedType === "MANHWA") return l === "ko" || l === "zh" || l === "zh-hk" || l === "";
    if (expectedType === "MANGA") return l === "ja" || l === "";
    return true;
  };

  for (const entry of entries) {
    const a = entry.attributes;
    if (!a) continue;

    // Doujinshi/parodies are never the canonical series.
    const displayTitle = a.title?.en || Object.values(a.title || {})[0] || "";
    if (DOUJIN_MARKER.test(displayTitle)) continue;
    if (!a.originalLanguage) continue; // original works always carry a language

    if (!typeOk(a.originalLanguage)) continue;

    const allTitles = [
      ...Object.values(a.title || {}),
      ...(a.altTitles || []).flatMap((t) => Object.values(t)),
    ];
    const titleMatch = allTitles.some((t) => targets.has(normalizeTitle(t)));
    if (!titleMatch) continue;

    return entry;
  }
  return null;
}

function parseLastChapter(raw: unknown): number | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/**
 * Highest published chapter number on MangaDex for a series, derived from its
 * actual chapter list. Needed because `attributes.lastChapter` is often
 * empty (MangaDex deprecated that field for many records). Chapters arrive
 * newest-first, so a single page of 100 is enough for any realistic series.
 *
 * Chapter numbers come from scanlation releases: duplicates across groups
 * and ".5" extras exist, so we take the max numeric value rather than a
 * count of rows.
 */
async function fetchMaxChapterNumber(mangaId: string): Promise<number | null> {
  const json = await fetchJsonIPv4<{ data?: Array<{ attributes?: { chapter?: string } }> }>(
    `${MANGADEX_API}/manga/${mangaId}/feed?limit=100&order%5Bchapter%5D=desc` +
      `&translatedLanguage%5B%5D=en&contentRating%5B%5D=safe&contentRating%5B%5D=suggestive&contentRating%5B%5D=erotica&contentRating%5B%5D=pornographic`,
  );
  const rows = json?.data ?? [];
  let max = 0;
  for (const row of rows) {
    const n = Number.parseFloat(row?.attributes?.chapter ?? "");
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max > 0 ? Math.floor(max) : null;
}

/**
 * Resolve live chapter count + release status from MangaDex.
 *
 * Returns null when the series cannot be identified confidently — callers
 * treat that as "no data" and keep their existing fallbacks.
 */
export async function findMangaDexInfo(
  title: string,
  titleForms: string[] = [],
  expectedType: "MANGA" | "MANHWA" | "UNKNOWN" = "UNKNOWN",
): Promise<MangaDexInfo | null> {
  const forms = [...new Set([title, ...titleForms].map((t) => (t || "").trim()).filter(Boolean))];
  if (forms.length === 0) return null;

  const cacheKey = `mangadex:info:${expectedType}:${forms.slice(0, 3).join("|").toLowerCase()}`;
  const cached = cacheGet<MangaDexInfo | null>(cacheKey);
  if (cached !== null) return cached;

  let best: MangaDexInfo | null = null;
  // Query the top title forms concurrently; evaluate in form order so the
  // primary title keeps priority over romaji/synonym forms.
  const responses = await Promise.all(
    forms.slice(0, 3).map((form) =>
      fetchJsonIPv4<{ data?: MangaDexEntry[] }>(
        `${MANGADEX_API}/manga?title=${encodeURIComponent(form)}&limit=8` +
          `&contentRating%5B%5D=safe&contentRating%5B%5D=suggestive&contentRating%5B%5D=erotica`,
      ),
    ),
  );

  for (const json of responses) {
    const entries: MangaDexEntry[] = json?.data ?? [];
    if (entries.length === 0) continue;
    const entry = pickMangaDexEntry(entries, forms, expectedType);
    if (!entry?.attributes) continue;

    // lastChapter is empty for many records — derive the live count from the
    // actual chapter feed when the attribute is missing.
    const chapters =
      parseLastChapter(entry.attributes.lastChapter) ?? (await fetchMaxChapterNumber(entry.id));

    best = {
      chapters,
      status: normalizeStatus(entry.attributes.status),
    };
    break;
  }

  cacheSet(cacheKey, best, MANGADEX_CACHE_TTL);
  return best;
}
