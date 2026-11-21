/**
 * Backfill & Fix Media Release Statuses.
 * Uses MangaUpdates to accurately classify FINISHED, CANCELLED, and HIATUS media
 * that are currently mislabeled as RELEASING.
 */

import { prisma } from "../src/lib/prisma";
import { fetchLiveMangaInfo } from "../src/lib/live-chapters";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== Starting Media Status Backfill ===");

  // 1. Explicit fix for Accel World:
  // Link to manga adaptation ID 52993 (format MANGA, chapters 42, status FINISHED)
  const accelWorld = await prisma.media.findFirst({
    where: { title: { contains: "Accel World", mode: "insensitive" } },
  });
  if (accelWorld) {
    console.log(`Fixing Accel World (${accelWorld.id})...`);
    await prisma.media.update({
      where: { id: accelWorld.id },
      data: {
        anilistId: 52993,
        status: "FINISHED",
        totalChapters: 42,
      },
    });
    console.log("✓ Accel World updated to FINISHED, 42 chapters, anilistId 52993");
  }

  // 2. Query all remaining RELEASING media in DB
  const releasingMedia = await prisma.media.findMany({
    where: { status: "RELEASING" },
    select: { id: true, title: true, totalChapters: true, status: true },
    orderBy: { title: "asc" },
  });

  console.log(`Found ${releasingMedia.length} media currently marked as RELEASING.`);

  let finishedCount = 0;
  let cancelledCount = 0;
  let hiatusCount = 0;
  let unchangedCount = 0;
  let errorCount = 0;

  const CONCURRENCY = 10;
  for (let i = 0; i < releasingMedia.length; i += CONCURRENCY) {
    const chunk = releasingMedia.slice(i, i + CONCURRENCY);

    await Promise.all(
      chunk.map(async (m) => {
        try {
          const live = await fetchLiveMangaInfo(m.title);
          if (!live) {
            unchangedCount++;
            return;
          }

          const updateData: { status?: string; totalChapters?: number } = {};

          if (live.status && live.status !== "RELEASING") {
            updateData.status = live.status;
          }

          if (live.chapters && live.chapters > 0 && live.chapters > m.totalChapters) {
            updateData.totalChapters = live.chapters;
          }

          if (Object.keys(updateData).length > 0) {
            await prisma.media.update({
              where: { id: m.id },
              data: updateData,
            });

            if (updateData.status === "FINISHED") {
              finishedCount++;
              console.log(`[FINISHED] "${m.title}" -> ${updateData.totalChapters ?? m.totalChapters} Ch.`);
            } else if (updateData.status === "CANCELLED") {
              cancelledCount++;
              console.log(`[CANCELLED] "${m.title}"`);
            } else if (updateData.status === "HIATUS") {
              hiatusCount++;
              console.log(`[HIATUS] "${m.title}"`);
            } else if (updateData.totalChapters) {
              console.log(`[CHAPTERS] "${m.title}" -> updated to ${updateData.totalChapters} Ch.`);
            }
          } else {
            unchangedCount++;
          }
        } catch (err) {
          errorCount++;
          console.warn(`Error checking "${m.title}":`, err instanceof Error ? err.message : err);
        }
      })
    );

    // Polite delay between batches to respect MangaUpdates
    await sleep(150);

    const progress = Math.min(i + CONCURRENCY, releasingMedia.length);
    if (progress % 30 === 0 || progress === releasingMedia.length) {
      console.log(`Progress: ${progress}/${releasingMedia.length} processed...`);
    }
  }

  console.log("\n=== Backfill Summary ===");
  console.log(`FINISHED: ${finishedCount}`);
  console.log(`CANCELLED: ${cancelledCount}`);
  console.log(`HIATUS: ${hiatusCount}`);
  console.log(`UNCHANGED (Still Releasing): ${unchangedCount}`);
  console.log(`Errors: ${errorCount}`);
}

run()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
