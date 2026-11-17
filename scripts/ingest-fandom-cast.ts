/**
 * Global full-cast ingestion dari kategori wiki Fandom.
 * Berjalan untuk SEMUA media di database (bukan hanya list hardcoded):
 *  - fetchFandomCategoryCharactersPaginated() → semua halaman karakter di kategori
 *  - upsert Character { name, imageUrl, introducedAtChapter: 1 } (aman untuk kontrak zero-spoiler)
 *
 * Usage:
 *  npx tsx -r dotenv/config scripts/ingest-fandom-cast.ts [mediaId=<anilistId>] [--limit=100] [--dry-run]
 */

import { prisma } from "../src/lib/prisma";
import { fetchFandomCategoryCharactersPaginated } from "../src/lib/fandom";
import { normalizeName } from "../src/lib/name-dedupe";
import { buildSeriesConfigs } from "./series-config";

async function main() {
  const args = process.argv.slice(2);
  const targetIdArg = args.find((a) => a.startsWith("mediaId=") || a.startsWith("--mediaId="));
  const targetId = targetIdArg ? parseInt(targetIdArg.split("=")[1], 10) : null;
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 500;
  const dryRun = args.includes("--dry-run");

  const configs = await buildSeriesConfigs();

  for (const config of configs) {
    if (targetId && config.anilistId !== targetId) continue;
    if (!config.fandomWiki) {
      console.warn(`[SKIP] ${config.title}: subdomain Fandom tidak ditemukan.`);
      continue;
    }

    console.log(`\n=== [CAST] ${config.title} (${config.fandomWiki}.fandom.com) ===`);
    const cast = await fetchFandomCategoryCharactersPaginated(config.fandomWiki, limit);
    if (!cast || cast.length === 0) {
      console.log("[CAST] Tidak ada karakter ditemukan di kategori wiki.");
      continue;
    }
    console.log(`[CAST] ${cast.length} kandidat dari kategori wiki.`);

    const existing = await prisma.character.findMany({
      where: { mediaId: config.mediaId },
      select: { name: true, aliases: true, imageUrl: true },
    });
    const existingKeys = new Set<string>();
    for (const c of existing) {
      existingKeys.add(normalizeName(c.name));
      for (const a of c.aliases) existingKeys.add(normalizeName(a));
    }

    let created = 0;
    let skipped = 0;
    for (const person of cast) {
      if (!person?.name || !person.name.trim()) continue;
      const key = normalizeName(person.name);
      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }
      existingKeys.add(key); // juga mencegah duplikat antar kategori dalam batch ini

      if (dryRun) {
        console.log(`  [DRY] Akan menambah: ${person.name}`);
        created++;
        continue;
      }

      await prisma.character.create({
        data: {
          mediaId: config.mediaId,
          name: person.name.trim(),
          aliases: [],
          imageUrl: person.imageUrl || "",
          // aman: chapter 1 = muncul sejak awal, tidak membocorkan timeline
          introducedAtChapter: 1,
        },
      });
      created++;
    }
    console.log(`[DB] ${config.title}: +${created} karakter baru, ${skipped} sudah ada.`);
  }

  console.log("\nSelesai. Untuk lore (deskripsi/status/faksi/relasi), jalankan enrich-all.ts.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
