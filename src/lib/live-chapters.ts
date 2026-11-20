import https from "node:https";
import { prisma } from "./prisma";

// In-memory cache for live chapter counts to prevent redundant queries
const chapterCache = new Map<string, { chapters: number; timestamp: number }>();
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

/**
 * Searches MangaUpdates for the title and retrieves the actual live chapter count.
 */
export async function fetchLiveChapterCount(title: string): Promise<number | null> {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) return null;

  const cached = chapterCache.get(normalizedTitle);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.chapters;
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
    const topRecord = searchData?.results?.[0]?.record;
    if (!topRecord?.series_id) return null;

    const detailRes = await requestIPv4(`https://api.mangaupdates.com/v1/series/${topRecord.series_id}`);
    if (!detailRes.ok) return null;
    const detail = await detailRes.json();

    const count = parseChapterFromDetail(detail);
    if (count && count > 0) {
      chapterCache.set(normalizedTitle, { chapters: count, timestamp: Date.now() });
      return count;
    }
  } catch (err) {
    console.warn(`[live-chapters] Failed to fetch live chapters for "${title}":`, err instanceof Error ? err.message : err);
  }

  return null;
}

/**
 * Checks and updates a specific Media record with the live chapter count if currently releasing.
 */
export async function syncMediaLiveChapters(mediaId: string): Promise<number | null> {
  try {
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      select: { id: true, title: true, status: true, totalChapters: true },
    });

    if (!media || media.status !== "RELEASING") return null;

    const liveCount = await fetchLiveChapterCount(media.title);
    if (liveCount && liveCount > 0 && liveCount !== media.totalChapters) {
      await prisma.media.update({
        where: { id: mediaId },
        data: { totalChapters: liveCount },
      });
      return liveCount;
    }

    return media.totalChapters;
  } catch (err) {
    console.error(`[live-chapters] Error syncing media ${mediaId}:`, err);
    return null;
  }
}
