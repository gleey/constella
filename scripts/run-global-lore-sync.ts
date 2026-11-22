/**
 * Global lore sync — every series, AI-powered.
 *
 * "Global semua seri" chosen by the user means the full AI pipeline, not just
 * the 30 biggest missing-lore series. This script sequences the steps so the
 * slower, token-heavy phase always runs on the freshest cast:
 *
 *   1. ingest-fandom-cast.ts  (no AI) — fills the ~447 zero-character series
 *      with a roster from Fandom/Wikipedia/Kitsu so they have something to
 *      enrich.
 *   2. enrich-all.ts --limit=20 (AI)  — for every series, extracts temporal
 *      lore (descriptions, statuses, factions, relationships) from wiki prose.
 *      Priority-override series use their curated mainCharacters list; the
 *      rest use the first --limit characters by catalog order.
 *
 * MangaUpdates outages are tolerated by the circuit breaker in
 * src/lib/live-chapters.ts: after 3 consecutive failures the lookup is
 * skipped for 10 minutes and Kitsu supplies the data.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/run-global-lore-sync.ts
 */

import { spawn } from "node:child_process";
import path from "node:path";

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
  console.log("=== Global Lore Sync — Step 1/2: cast ingestion (no AI) ===");
  const ingestCode = await run("ingest-fandom-cast.ts", ["--limit=300", "--empty-only"]);
  if (ingestCode !== 0) {
    console.warn(`ingest-fandom-cast exited ${ingestCode}; continuing anyway.`);
  }

  console.log("\n=== Global Lore Sync — Step 2/2: AI lore enrichment ===");
  const enrichCode = await run("enrich-all.ts", ["--limit=20"]);
  if (enrichCode !== 0) {
    console.error(`enrich-all exited ${enrichCode}`);
    process.exit(enrichCode);
  }

  console.log("\n=== Global lore sync finished. ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
