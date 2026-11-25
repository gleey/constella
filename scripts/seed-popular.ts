/**
 * Tier 1 Bulk Catalog Seeder (NO AI, AniList only).
 *
 * Fills the Media (+ Character) catalog directly from AniList popular listing.
 * No hardcoded series lists. No Gemini/Groq calls. No Fandom calls.
 * Safe to run repeatedly: existing Media (by anilistId) are skipped.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/seed-popular.ts [options]
 *
 * Options:
 *   --pages=<n>        AniList pages to walk (default: 2)
 *   --perPage=<n>      Items per page, max 50 (default: 20)
 *   --limit=<n>        Max titles to ingest overall (default: 40)
 *   --country=<code>   AniList countryOfOrigin filter (default: KR)
 *   --sort=<sort>      AniList sort key (default: POPULARITY_DESC)
 *   --media-only       Only ingest Media rows, skip Character rows
 *   --throttle=<ms>    Delay between AniList detail fetches (default: 800)
 *   --dry-run          Preview only, no DB writes
 *   --help, -h         Show this help
 *
 * Examples:
 *   npx tsx -r dotenv/config scripts/seed-popular.ts --dry-run
 *   npx tsx -r dotenv/config scripts/seed-popular.ts --pages=2 --perPage=20 --limit=40
 */

import { prisma } from "../src/lib/prisma";
import { fetchPopularMedia, fetchMediaDetail } from "../src/lib/anilist";
import { resolveCharacterName } from "../src/lib/name-resolution";
import { normalizeName } from "../src/lib/name-dedupe";
import { resolveTotalChapters } from "../src/lib/chapter-count";

interface CliOptions {
  pages: number;
  perPage: number;
  limit: number;
  country: string;
  sort: string;
  mediaOnly: boolean;
  throttleMs: number;
  dryRun: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const opts: CliOptions = {
    pages: 2,
    perPage: 20,
    limit: 40,
    country: "KR",
    sort: "POPULARITY_DESC",
    mediaOnly: false,
    throttleMs: 800,
    dryRun: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--pages=")) opts.pages = Math.max(1, parseInt(arg.split("=")[1], 10) || 2);
    else if (arg.startsWith("--perPage=")) opts.perPage = Math.min(50, Math.max(1, parseInt(arg.split("=")[1], 10) || 20));
    else if (arg.startsWith("--limit=")) opts.limit = Math.max(1, parseInt(arg.split("=")[1], 10) || 40);
    else if (arg.startsWith("--country=")) opts.country = arg.split("=")[1] || "KR";
    else if (arg.startsWith("--sort=")) opts.sort = arg.split("=")[1] || "POPULARITY_DESC";
    else if (arg === "--media-only") opts.mediaOnly = true;
    else if (arg.startsWith("--throttle=")) opts.throttleMs = Math.max(0, parseInt(arg.split("=")[1], 10) || 800);
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  return opts;
}

function printUsage() {
  console.log(`
Tier 1 Bulk Catalog Seeder (NO AI, AniList only)

Usage:
  npx tsx -r dotenv/config scripts/seed-popular.ts [options]

Options:
  --pages=<n>        AniList pages to walk (default: 2)
  --perPage=<n>      Items per page, max 50 (default: 20)
  --limit=<n>        Max titles to ingest overall (default: 40)
  --country=<code>   AniList countryOfOrigin filter (default: KR)
  --sort=<sort>      AniList sort key (default: POPULARITY_DESC)
  --media-only       Only ingest Media rows, skip Character rows
  --throttle=<ms>    Delay between AniList detail fetches (default: 800)
  --dry-run          Preview only, no DB writes
  --help, -h         Show this help
`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const opts = parseArgs();
  console.log(
    `[SeedPopular] pages=${opts.pages} perPage=${opts.perPage} limit=${opts.limit} ` +
      `country=${opts.country} sort=${opts.sort} mediaOnly=${opts.mediaOnly} dryRun=${opts.dryRun}`,
  );

  // 1. Walk AniList popular pages (dynamic discovery, no hardcoded IDs)
  const seen = new Map<number, string>();
  for (let page = 1; page <= opts.pages && seen.size < opts.limit; page++) {
    console.log(`[SeedPopular] Fetching popular page ${page}...`);
    const items = await fetchPopularMedia({
      page,
      perPage: opts.perPage,
      countryOfOrigin: opts.country,
      sort: [opts.sort],
    });
    if (items.length === 0) break;
    for (const item of items) {
      if (!seen.has(item.id)) seen.set(item.id, item.title);
      if (seen.size >= opts.limit) break;
    }
    if (page < opts.pages) await sleep(opts.throttleMs);
  }

  const targets = [...seen.entries()].map(([anilistId, titleHint]) => ({ anilistId, titleHint }));
  console.log(`[SeedPopular] Discovered ${targets.length} titles`);

  let createdMedia = 0;
  let skippedMedia = 0;
  let createdChars = 0;
  let failed = 0;

  // 2. Ingest each title: Media row + (optional) Character rows from AniList detail
  for (let i = 0; i < targets.length; i++) {
    const { anilistId, titleHint } = targets[i];
    console.log(`\n--- [${i + 1}/${targets.length}] AniList #${anilistId} (${titleHint}) ---`);

    try {
      const existing = await prisma.media.findUnique({ where: { anilistId } });
      if (existing) {
        console.log(`[SKIP] Media already in DB: "${existing.title}"`);
        skippedMedia++;
        continue;
      }

      const detail = await fetchMediaDetail(anilistId);

      if (opts.dryRun) {
        console.log(
          `[DRY-RUN] Would create Media "${detail.title}" + ${opts.mediaOnly ? 0 : detail.characters.length} characters`,
        );
        createdMedia++;
        continue;
      }

      const { totalChapters } = await resolveTotalChapters(detail);
      const media = await prisma.media.create({
        data: {
          anilistId: detail.id,
          title: detail.title,
          type: detail.countryOfOrigin === "KR" ? "MANHWA" : "MANGA",
          coverImage: detail.coverImage,
          totalChapters,
          chapterNumberingSource: "official_en",
          countryOfOrigin: detail.countryOfOrigin || opts.country,
        },
      });
      createdMedia++;
      console.log(`[DB] Created Media "${media.title}"`);

      if (!opts.mediaOnly && detail.characters.length > 0) {
        const existingChars = await prisma.character.findMany({
          where: { mediaId: media.id },
          select: { id: true, name: true, aliases: true },
        });
        for (let cIdx = 0; cIdx < detail.characters.length; cIdx++) {
          const c = detail.characters[cIdx];
          const name = normalizeName(c.name);
          if (!name) continue;

          const matchedId = resolveCharacterName(name, existingChars);
          if (matchedId) continue; // dedupe within this ingest run

          const introducedAtChapter = cIdx === 0 ? 1 : Math.min(10, detail.chapters || 1);
          const created = await prisma.character.create({
            data: {
              mediaId: media.id,
              name,
              aliases: c.aliases,
              imageUrl: c.imageUrl || "",
              introducedAtChapter,
            },
          });
          existingChars.push({ id: created.id, name: created.name, aliases: created.aliases });

          // Placeholder lore-free rows so graph nodes render before Tier 2 enrichment
          await prisma.characterStatus.create({
            data: {
              characterId: created.id,
              status: "Alive",
              validFrom: introducedAtChapter,
              validUntil: null,
              isSensitive: false,
            },
          });
          await prisma.characterDescription.create({
            data: {
              characterId: created.id,
              text: `${name} is a character featured in ${detail.title}.`,
              validFrom: introducedAtChapter,
              validUntil: null,
              isSensitive: false,
            },
          });
          createdChars++;
        }
        console.log(`[DB] ${detail.characters.length} AniList characters synced for "${media.title}"`);
      }
    } catch (err: unknown) {
      failed++;
      console.warn(`[WARN] Failed AniList #${anilistId}: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (i < targets.length - 1) await sleep(opts.throttleMs);
  }

  console.log(
    `\n[SUMMARY] media created=${createdMedia} skipped=${skippedMedia} characters created=${createdChars} failed=${failed}`,
  );
  console.log("Next: Tier 2 lore enrichment per judul via scripts/enrich-fandom.ts --title=\"...\" --limit=20");
}

main()
  .catch((e) => {
    console.error("FATAL ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
