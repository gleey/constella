/**
 * Backfill AniList PREQUEL/SEQUEL links for the existing catalog.
 *
 * Idempotent: skips media that already carry at least one relation, so it can
 * be re-run to resume after an interruption. Series links are refreshed on
 * every catalog sync too; this script only catches up on the existing rows.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/backfill-relations.ts [--max-media N] [--concurrency N]
 */

import { prisma } from "../src/lib/prisma";
import { fetchMediaDetail } from "../src/lib/anilist";
import { saveMediaRelations, normalizeRelations } from "../src/lib/media-relations";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: number) => {
    const i = args.indexOf(flag);
    if (i === -1) return fallback;
    const n = Number(args[i + 1]);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    maxMedia: get("--max-media", Number.POSITIVE_INFINITY),
    concurrency: get("--concurrency", 2),
  };
}

async function main() {
  const { maxMedia, concurrency } = parseArgs();
  const media = await prisma.media.findMany({
    select: { id: true, anilistId: true, title: true, relations: true },
    orderBy: { title: "asc" },
    take: Number.isFinite(maxMedia) ? maxMedia : undefined,
  });

  const queue = media.filter((m) => normalizeRelations(m.relations).length === 0);
  console.log(`[relations] ${queue.length}/${media.length} media need a relation lookup`);

  let done = 0;
  let withLinks = 0;
  let failed = 0;

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()!;
      try {
        const detail = await fetchMediaDetail(item.anilistId);
        await saveMediaRelations(item.id, detail.relations);
        if (detail.relations.length > 0) {
          withLinks++;
          console.log(`[relations] ${item.title}: ${detail.relations.map((r) => `${r.relationType} ${r.title}`).join(", ")}`);
        }
      } catch (err) {
        failed++;
        console.warn(`[relations] ${item.title}: ${(err as Error).message}`);
      } finally {
        done++;
        if (done % 50 === 0) console.log(`[relations] progress ${done}/${media.length}`);
      }
      // AniList public limit is ~90 req/min; stay well under it.
      await sleep(2000);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  console.log(`[relations] selesai: ${done} diproses, ${withLinks} punya prequel/sequel, ${failed} gagal`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
