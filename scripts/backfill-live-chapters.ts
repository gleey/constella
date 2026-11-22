/**
 * Backfill live chapter counts for ongoing series that still carry the
 * static 100-chapter placeholder.
 *
 * AniList reports `chapters: null` for series that are still releasing, so
 * those rows used to be seeded with a placeholder. The live sources
 * (Kitsu → MangaUpdates) now supply a real count; this script applies it.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/backfill-live-chapters.ts
 */

import { prisma } from "../src/lib/prisma";
import { fetchLiveMangaInfo } from "../src/lib/live-chapters";
import { fetchMediaDetail, mediaTitleForms } from "../src/lib/anilist";

async function main() {
  console.log("=== Backfilling Live Chapter Counts for Releasing Media ===");

  const releasingMedia = await prisma.media.findMany({
    where: { status: "RELEASING" },
    select: {
      id: true,
      title: true,
      totalChapters: true,
      anilistId: true,
      type: true,
      countryOfOrigin: true,
    },
    orderBy: { title: "asc" },
  });

  console.log(`Found ${releasingMedia.length} releasing media to check.`);

  let updated = 0;
  let unchanged = 0;
  let notFound = 0;
  let skipped = 0;

  const BATCH_SIZE = 4;
  for (let i = 0; i < releasingMedia.length; i += BATCH_SIZE) {
    const batch = releasingMedia.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (m) => {
        try {
          // Title forms come from AniList (romaji/english/synonyms); MangaUpdates
          // and Kitsu both match on exact titles, so all forms widen the hit rate.
          let forms: string[] = [m.title];
          let anilistChapters: number | null = null;
          try {
            const detail = await fetchMediaDetail(m.anilistId);
            forms = mediaTitleForms(detail);
            anilistChapters = detail.chapters && detail.chapters > 0 ? detail.chapters : null;
          } catch {
            // AniList unavailable — fall back to the stored title alone.
          }

          // AniList knows the exact length of finished series; never override it.
          if (anilistChapters) {
            skipped++;
            return;
          }

          const live = await fetchLiveMangaInfo(
            m.title,
            m.anilistId,
            forms,
            m.countryOfOrigin === "KR" ? "MANHWA" : "MANGA",
          );
          const liveCount = live?.chapters ?? null;

          if (liveCount && liveCount > 0) {
            if (liveCount !== m.totalChapters) {
              await prisma.media.update({
                where: { id: m.id },
                data: { totalChapters: liveCount },
              });
              console.log(`[UPDATED] "${m.title}": ${m.totalChapters} -> ${liveCount} Ch.`);
              updated++;
            } else {
              unchanged++;
            }
          } else {
            console.log(`[UNRESOLVED] "${m.title}" (kept at ${m.totalChapters} Ch.)`);
            notFound++;
          }
        } catch (err) {
          console.error(`[ERROR] "${m.title}":`, err instanceof Error ? err.message : err);
          notFound++;
        }
      })
    );

    // Polite delay between batches
    if (i + BATCH_SIZE < releasingMedia.length) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  console.log(`\n=== Backfill Summary ===`);
  console.log(`Total releasing: ${releasingMedia.length}`);
  console.log(`Updated with live counts: ${updated}`);
  console.log(`Already accurate / unchanged: ${unchanged}`);
  console.log(`Skipped (AniList knows the count): ${skipped}`);
  console.log(`Unresolved / kept fallback: ${notFound}`);
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
