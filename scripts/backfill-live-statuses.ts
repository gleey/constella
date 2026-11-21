/**
 * Backfill & Fix Media Release Statuses.
 * Uses AniList (authoritative via anilistId) rather than MangaUpdates title search
 * to prevent false positives (e.g. older completed works or novels with the same title).
 */

import { prisma } from "../src/lib/prisma";
import { normalizeMediaStatus } from "../src/lib/anilist";

const ANILIST_URL = "https://graphql.anilist.co";

const BATCH_QUERY = `
query ($ids: [Int]) {
  Page(page: 1, perPage: 50) {
    media(id_in: $ids, type: MANGA) {
      id
      status
    }
  }
}
`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== Starting Media Status Sync (from AniList) ===");

  const allMedia = await prisma.media.findMany({
    select: { id: true, anilistId: true, title: true, status: true },
    orderBy: { title: "asc" },
  });

  console.log(`Found ${allMedia.length} media records in DB.`);

  let updatedCount = 0;
  let unchangedCount = 0;
  const chunkSize = 50;

  for (let i = 0; i < allMedia.length; i += chunkSize) {
    const chunk = allMedia.slice(i, i + chunkSize);
    const ids = chunk.map((m) => m.anilistId);

    try {
      const res = await fetch(ANILIST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: BATCH_QUERY, variables: { ids } }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          console.warn("Rate limited, waiting 30s...");
          await sleep(30000);
          i -= chunkSize;
          continue;
        }
        console.warn(`Batch failed with HTTP ${res.status}`);
        continue;
      }

      const json = await res.json();
      const anilistList: Array<{ id: number; status?: string }> = json.data?.Page?.media || [];

      for (const a of anilistList) {
        const dbItem = chunk.find((c) => c.anilistId === a.id);
        if (!dbItem) continue;

        const authoritativeStatus = normalizeMediaStatus(a.status);
        if (dbItem.status !== authoritativeStatus) {
          await prisma.media.update({
            where: { id: dbItem.id },
            data: { status: authoritativeStatus },
          });
          console.log(`[STATUS] "${dbItem.title}": ${dbItem.status} -> ${authoritativeStatus}`);
          updatedCount++;
        } else {
          unchangedCount++;
        }
      }

      await sleep(350);
    } catch (err) {
      console.warn("Batch error:", err);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Updated: ${updatedCount}`);
  console.log(`Unchanged: ${unchangedCount}`);
}

run()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
