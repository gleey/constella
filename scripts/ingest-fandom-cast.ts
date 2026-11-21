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
import { canonicalizeName, shouldMergeCharacters } from "../src/lib/name-dedupe";
import { isBrokenImageUrl } from "../src/lib/auto-sync";
import { buildSeriesConfigs } from "./series-config";

async function main() {
  const args = process.argv.slice(2);
  const targetIdArg = args.find((a) => a.startsWith("mediaId=") || a.startsWith("--mediaId="));
  const targetId = targetIdArg ? parseInt(targetIdArg.split("=")[1], 10) : null;
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 500;
  const dryRun = args.includes("--dry-run");

  const configs = await buildSeriesConfigs(targetId);

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
      select: { id: true, name: true, aliases: true, imageUrl: true },
    });

    let created = 0;
    let updatedImg = 0;
    let skipped = 0;
    for (const person of cast) {
      if (!person?.name || !person.name.trim()) continue;
      const cleanName = person.name.trim();

      const existingChar = existing.find(
        (c) =>
          c.name.toLowerCase() === cleanName.toLowerCase() ||
          canonicalizeName(c.name) === canonicalizeName(cleanName) ||
          shouldMergeCharacters(c.name, cleanName) !== null ||
          c.aliases.some(
            (a) =>
              a.toLowerCase() === cleanName.toLowerCase() ||
              canonicalizeName(a) === canonicalizeName(cleanName) ||
              shouldMergeCharacters(a, cleanName) !== null
          )
      );

      if (existingChar) {
        let changed = false;
        const updates: { imageUrl?: string; aliases?: string[] } = {};

        if (person.imageUrl && isBrokenImageUrl(existingChar.imageUrl)) {
          updates.imageUrl = person.imageUrl;
          existingChar.imageUrl = person.imageUrl;
          changed = true;
          updatedImg++;
        }

        if (cleanName !== existingChar.name && !existingChar.aliases.includes(cleanName)) {
          updates.aliases = Array.from(new Set([...existingChar.aliases, cleanName]));
          existingChar.aliases = updates.aliases;
          changed = true;
        }

        if (changed && !dryRun) {
          await prisma.character.update({
            where: { id: existingChar.id },
            data: updates,
          });
        }
        skipped++;
        continue;
      }

      if (dryRun) {
        console.log(`  [DRY] Akan menambah: ${cleanName}`);
        created++;
        continue;
      }

      const createdChar = await prisma.character.create({
        data: {
          mediaId: config.mediaId,
          name: cleanName,
          aliases: [],
          imageUrl: person.imageUrl || "",
          // aman: chapter 1 = muncul sejak awal, tidak membocorkan timeline
          introducedAtChapter: 1,
        },
      });
      existing.push({
        id: createdChar.id,
        name: createdChar.name,
        aliases: createdChar.aliases,
        imageUrl: createdChar.imageUrl,
      });
      created++;
    }
    console.log(`[DB] ${config.title}: +${created} karakter baru, ${updatedImg} gambar diperbarui, ${skipped} sudah ada.`);
  }

  console.log("\nSelesai. Untuk lore (deskripsi/status/faksi/relasi), jalankan enrich-all.ts.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
