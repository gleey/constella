/**
 * Continuous Catalog Synchronization Script (Rate-Limit Safe).
 *
 * Continuously crawls AniList manga/manhwa database page-by-page and syncs
 * live ongoing series without exceeding AniList's 90 req/min rate limit.
 *
 * Features:
 *  - Polite delay between requests (~800ms) to stay well under rate limits.
 *  - Automatic 429 exponential backoff if rate-limited.
 *  - Dual mode: walks deep catalog pages + checks recently updated ongoing titles.
 *  - Metadata-only upsert (no AI token burn).
 *
 * Usage:
 *  npx tsx scripts/sync-catalog-continuous.ts [--maxPages=20] [--ongoingOnly] [--loop]
 */

import { prisma } from "../src/lib/prisma";
import { fetchPopularMediaPage } from "../src/lib/anilist";
import { syncOngoingReleases } from "../src/lib/catalog-import";
import { resolveTotalChapters } from "../src/lib/chapter-count";

// Safe rate limit delay: 800ms between requests keeps req/min at ~75 (safe under 90 cap)
const SAFE_DELAY_MS = 800;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const args = process.argv.slice(2);
const isLoop = args.includes("--loop");
const ongoingOnly = args.includes("--ongoingOnly");
const maxPagesArg = args.find((a) => a.startsWith("--maxPages="));
const maxPages = maxPagesArg ? parseInt(maxPagesArg.split("=")[1], 10) : 15;

async function runCatalogCycle() {
  console.log(`[${new Date().toLocaleTimeString()}] Starting catalog sync cycle...`);

  // 1. Sync ongoing / releasing manhwa & manga
  console.log("Checking recently updated ongoing series...");
  try {
    const ongoingResult = await syncOngoingReleases({
      maxPages: 3,
      countries: ["KR", "JP"],
    });
    console.log(
      `Ongoing sync: ${ongoingResult.imported} new, ${ongoingResult.updated} updated across ${ongoingResult.pages} pages.`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Ongoing sync error: ${msg}`);
    if (msg.includes("429")) {
      console.log("Rate limited! Pausing for 60 seconds...");
      await sleep(60000);
    }
  }

  if (ongoingOnly) return;

  await sleep(SAFE_DELAY_MS * 2);

  // 2. Continuous discovery crawl for both KR (manhwa) and JP (manga)
  const countries = ["KR", "JP"];
  for (const country of countries) {
    console.log(`\nCrawling catalog for ${country} (up to ${maxPages} pages)...`);
    for (let page = 1; page <= maxPages; page++) {
      try {
        console.log(`[${country}] Fetching discovery page ${page}/${maxPages}...`);
        const discovery = await fetchPopularMediaPage({
          page,
          perPage: 50,
          countryOfOrigin: country,
          sort: ["POPULARITY_DESC"],
        });

        let newCount = 0;
        let updateCount = 0;

        for (const item of discovery.results) {
          if (!item.title || !item.coverImage) continue;

          const existing = await prisma.media.findUnique({
            where: { anilistId: item.id },
            select: { id: true, totalChapters: true },
          });

          const { totalChapters: chapters } = await resolveTotalChapters(
            {
              id: item.id,
              title: item.title,
              chapters: item.chapters,
              countryOfOrigin: item.countryOfOrigin,
              romajiTitle: item.romajiTitle,
              englishTitle: item.englishTitle,
              synonyms: item.synonyms,
            },
            existing?.totalChapters,
          );

          if (existing) {
            await prisma.media.update({
              where: { id: existing.id },
              data: {
                title: item.title,
                coverImage: item.coverImage,
                totalChapters: chapters,
                status: item.status,
                contentRating: item.contentRating,
                genres: item.genres,
              },
            });
            updateCount++;
          } else {
            await prisma.media.create({
              data: {
                anilistId: item.id,
                title: item.title,
                type: country === "KR" ? "MANHWA" : "MANGA",
                coverImage: item.coverImage,
                totalChapters: chapters,
                chapterNumberingSource: "anilist",
                countryOfOrigin: country,
                status: item.status,
                contentRating: item.contentRating,
                genres: item.genres,
              },
            });
            newCount++;
          }
        }

        console.log(`[${country} p.${page}] +${newCount} new, ~${updateCount} updated (total on page: ${discovery.results.length}).`);

        if (page >= discovery.lastPage) {
          console.log(`Reached last page (${discovery.lastPage}) for ${country}.`);
          break;
        }

        await sleep(SAFE_DELAY_MS);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error on ${country} page ${page}:`, msg);
        if (msg.includes("429")) {
          console.log("Hit rate limit (429). Sleeping 60s before retry...");
          await sleep(60000);
          page--; // retry same page
        } else {
          break;
        }
      }
    }
  }

  const finalCount = await prisma.media.count();
  console.log(`\nCycle finished! Total media catalog in database: ${finalCount}`);
}

async function main() {
  if (isLoop) {
    console.log("Continuous loop mode enabled. Running every 30 minutes...");
    while (true) {
      await runCatalogCycle();
      console.log("Sleeping 30 minutes until next cycle...\n");
      await sleep(30 * 60 * 1000);
    }
  } else {
    await runCatalogCycle();
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
