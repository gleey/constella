import { prisma } from "../src/lib/prisma";
import { fetchLiveChapterCount } from "../src/lib/live-chapters";

async function main() {
  console.log("=== Backfilling Live Chapter Counts for Releasing Media ===");

  const releasingMedia = await prisma.media.findMany({
    where: { status: "RELEASING", totalChapters: 100 },
    select: { id: true, title: true, totalChapters: true },
    orderBy: { title: "asc" },
  });

  console.log(`Found ${releasingMedia.length} releasing media to check.`);

  let updated = 0;
  let unchanged = 0;
  let notFound = 0;

  const BATCH_SIZE = 4;
  for (let i = 0; i < releasingMedia.length; i += BATCH_SIZE) {
    const batch = releasingMedia.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (m) => {
        try {
          const liveCount = await fetchLiveChapterCount(m.title);
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
