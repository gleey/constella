/**
 * Backfill Content Rating & Release Status for all existing media in the DB.
 * Queries AniList in batches of 50 to avoid rate limits.
 */

import { prisma } from "../src/lib/prisma";
import { determineContentRating, normalizeMediaStatus } from "../src/lib/anilist";

const ANILIST_URL = "https://graphql.anilist.co";

const BATCH_QUERY = `
query ($ids: [Int]) {
  Page(page: 1, perPage: 50) {
    media(id_in: $ids, type: MANGA) {
      id
      status
      isAdult
      genres
    }
  }
}
`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfill() {
  console.log("Fetching all media from database...");
  const allMedia = await prisma.media.findMany({
    select: { id: true, anilistId: true, title: true },
  });

  console.log(`Found ${allMedia.length} media records to categorize.`);

  const chunkSize = 50;
  let totalProcessed = 0;
  let safeCount = 0;
  let suggestiveCount = 0;
  let releasingCount = 0;
  let finishedCount = 0;

  for (let i = 0; i < allMedia.length; i += chunkSize) {
    const chunk = allMedia.slice(i, i + chunkSize);
    const ids = chunk.map((m) => m.anilistId);

    try {
      console.log(`Processing batch ${Math.floor(i / chunkSize) + 1}/${Math.ceil(allMedia.length / chunkSize)} (${ids.length} items)...`);

      const res = await fetch(ANILIST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: BATCH_QUERY, variables: { ids } }),
      });

      if (!res.ok) {
        console.warn(`Batch failed with HTTP ${res.status}: ${await res.text()}`);
        if (res.status === 429) {
          console.log("Rate limited! Waiting 60s...");
          await sleep(60000);
          i -= chunkSize; // retry
          continue;
        }
        continue;
      }

      const json = await res.json();
      const items: Array<{ id: number; status?: string; isAdult?: boolean; genres?: string[] }> =
        json.data?.Page?.media || [];

      for (const item of items) {
        const rating = determineContentRating(item.isAdult, item.genres);
        const status = normalizeMediaStatus(item.status);
        const genres = item.genres || [];

        if (rating === "SUGGESTIVE_18") suggestiveCount++;
        else safeCount++;

        if (status === "RELEASING") releasingCount++;
        else if (status === "FINISHED") finishedCount++;

        await prisma.media.update({
          where: { anilistId: item.id },
          data: {
            contentRating: rating,
            status,
            genres,
          },
        });
        totalProcessed++;
      }

      // Polite rate limit delay
      await sleep(750);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Batch error:", msg);
    }
  }

  console.log("\n================ Backfill Summary ================");
  console.log(`Total Media Categorized: ${totalProcessed} / ${allMedia.length}`);
  console.log(`Content Rating:`);
  console.log(`  - Safe: ${safeCount}`);
  console.log(`  - Suggestive / 18+: ${suggestiveCount}`);
  console.log(`Release Status:`);
  console.log(`  - Releasing: ${releasingCount}`);
  console.log(`  - Finished: ${finishedCount}`);
  console.log("===================================================\n");
}

backfill()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
