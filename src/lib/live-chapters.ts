import https from "node:https";
import { prisma } from "./prisma";

// In-memory cache for live manga info to prevent redundant queries
export type MediaReleaseStatus = "RELEASING" | "FINISHED" | "CANCELLED" | "HIATUS";

export interface LiveMangaData {
  chapters: number | null;
  status: MediaReleaseStatus | null;
}

const liveMangaCache = new Map<string, { data: LiveMangaData; timestamp: number }>();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

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

function parseChapterFromDetail(detail: any): number | null {
  if (!detail) return null;
  const status: string = detail.status || "";

  // 1. Look for patterns like "652 Chapters" or "426 Chapters (Ongoing)"
  const chaptersMatch = status.match(/(\d+)\s+Chapters/i);
  if (chaptersMatch && parseInt(chaptersMatch[1], 10) > 0) {
    return parseInt(chaptersMatch[1], 10);
  }

  // 2. Look for patterns like "115 Volumes (Ongoing)" with latest_chapter
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
 * Searches MangaUpdates for the title and retrieves live chapter count and release status.
 */
export async function fetchLiveMangaInfo(title: string): Promise<LiveMangaData | null> {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) return null;

  const cached = liveMangaCache.get(normalizedTitle);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    // Clean title of unnecessary subtitle artifacts for better search accuracy
    const query = normalizedTitle
      .replace(/\s*\(.*?\)\s*/g, " ")
      .replace(/\s*\[.*?\]\s*/g, " ")
      .trim();

    const searchRes = await requestIPv4("https://api.mangaupdates.com/v1/series/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ search: query || normalizedTitle, stype: "title" }),
    });

    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const results = searchData?.results || [];
    if (!results.length) return null;

    // Prefer non-novel entries if title has manga/manhwa adaptation
    const bestRecord =
      results.find((r: any) => r.record?.type && r.record.type.toLowerCase() !== "novel")?.record ||
      results[0]?.record;

    if (!bestRecord?.series_id) return null;

    const detailRes = await requestIPv4(`https://api.mangaupdates.com/v1/series/${bestRecord.series_id}`);
    if (!detailRes.ok) return null;
    const detail = await detailRes.json();

    const chapters = parseChapterFromDetail(detail);
    const status = parseStatusFromDetail(detail);

    const data: LiveMangaData = { chapters, status };
    liveMangaCache.set(normalizedTitle, { data, timestamp: Date.now() });
    return data;
  } catch (err) {
    console.warn(`[live-chapters] Failed to fetch live info for "${title}":`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Searches MangaUpdates for the title and retrieves the actual live chapter count.
 */
export async function fetchLiveChapterCount(title: string): Promise<number | null> {
  const info = await fetchLiveMangaInfo(title);
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
