/**
 * Global lore sync — every series, AI-powered.
 *
 * "Global semua seri" chosen by the user means the full AI pipeline, not just
 * the 30 biggest missing-lore series. This script sequences the steps so the
 * slower, token-heavy phase always runs on the freshest cast. The AI step is
 * driven directly (not by spawning `enrich-all.ts`) so one fatal error on a
 * single series never aborts the whole run.
 *
 *   1. ingest-fandom-cast.ts --empty-only (no AI) — fills the zero-character
 *      series with a roster from Fandom/Wikipedia/Kitsu so they have something
 *      to enrich.
 *   2. enrich-all.ts logic in-process (AI) — for every series, extracts
 *      temporal lore (descriptions, statuses, factions, relationships) from
 *      wiki prose. Priority-override series use their curated mainCharacters
 *      list; the rest use the first --limit characters by catalog order.
 *
 * MangaUpdates outages are tolerated by the circuit breaker in
 * src/lib/live-chapters.ts: after 3 consecutive failures the lookup is
 * skipped for 10 minutes and Kitsu supplies the data.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/run-global-lore-sync.ts [--limit=20]
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { buildSeriesConfigs } from "./series-config";
import { enrichMedia } from "./enrich-all";

const root = path.resolve(__dirname, "..");

function run(script: string, args: string[] = []): Promise<number> {
  return new Promise((resolve, reject) => {
    const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(
      cmd,
      ["tsx", "-r", "dotenv/config", `scripts/${script}`, ...args],
      { stdio: "inherit", cwd: root },
    );
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? `--limit=${limitArg.split("=")[1]}` : "--limit=20";

  console.log("=== Global Lore Sync — Step 1/2: cast ingestion (no AI) ===");
  const ingestCode = await run("ingest-fandom-cast.ts", ["--limit=300", "--empty-only"]);
  if (ingestCode !== 0) {
    console.warn(`ingest-fandom-cast exited ${ingestCode}; continuing anyway.`);
  }

  console.log("\n=== Global Lore Sync — Step 2/2: AI lore enrichment ===");
  const configs = await buildSeriesConfigs();
  console.log(`${configs.length} series to enrich (limit ${limit}).`);
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    try {
      await enrichMedia(config, { limit });
      ok++;
    } catch (err) {
      failed++;
      console.error(`[GLOBAL-LORE] FAILED for ${config.title}:`, err instanceof Error ? err.message : err);
    }
    if ((i + 1) % 25 === 0) {
      console.log(`[GLOBAL-LORE] progress ${i + 1}/${configs.length} ok=${ok} failed=${failed}`);
    }
  }

  console.log(`\n=== Global lore sync finished. ok=${ok} failed=${failed} ===`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
