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
import { fetchAltCharacterRoster } from "../src/lib/alt-sources";
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
  const emptyOnly = args.includes("--empty-only");

  const configs = await buildSeriesConfigs(targetId);

  for (const config of configs) {
    if (targetId && config.anilistId !== targetId) continue;
    const media = await prisma.media.findUnique({
      where: { anilistId: config.anilistId },
      include: { _count: { select: { characters: true } } },
    });
    if (!media) continue;
    if (emptyOnly && media._count.characters > 0) continue;

    // Primary source: the series' own Fandom wiki category.
    if (config.fandomWiki) {
      console.log(`\n=== [CAST] ${config.title} (${config.fandomWiki}.fandom.com) ===`);
      const cast = await fetchFandomCategoryCharactersPaginated(config.fandomWiki, limit);
      if (cast && cast.length > 0) {
        console.log(`[CAST] ${cast.length} kandidat dari kategori wiki.`);
        await upsertCast(config.mediaId, cast, dryRun, config.title);
        continue;
      }
      console.log("[CAST] Tidak ada karakter ditemukan di kategori wiki. Mencoba sumber alternatif...");
    }

    // Fallback: no wiki at all, or the wiki's character category is empty.
    // Wikipedia / Kitsu still give these series a cast instead of skipping them.
    console.log(`\n=== [CAST-ALT] ${config.title} (sumber alternatif) ===`);
    try {
      const altCast = await fetchAltCharacterRoster(
        media.title,
        config.synonyms,
        media.type === "MANHWA" ? "MANHWA" : "MANGA",
        limit,
      );
      if (altCast.length === 0) {
        console.log("[CAST-ALT] Tidak ada karakter dari sumber alternatif.");
        continue;
      }
      console.log(`[CAST-ALT] ${altCast.length} kandidat dari Wikipedia/Kitsu.`);
      await upsertCast(
        media.id,
        altCast.map((c) => ({ name: c.name, aliases: c.aliases, imageUrl: c.imageUrl })),
        dryRun,
        config.title,
      );
    } catch (err) {
      console.warn(`[CAST-ALT-WARN] ${(err as Error).message}`);
    }
  }

  console.log("\nSelesai. Untuk lore (deskripsi/status/faksi/relasi), jalankan enrich-all.ts.");
  await prisma.$disconnect();
}

interface CastCandidate {
  name: string;
  aliases?: string[];
  imageUrl?: string;
}

/**
 * Insert/merge a cast list into the DB with the project's dedup rules.
 * Shared by the Fandom and fallback-source paths so both behave identically.
 */
async function upsertCast(
  mediaId: string,
  cast: CastCandidate[],
  dryRun: boolean,
  title: string,
): Promise<void> {
  const existing = await prisma.character.findMany({
    where: { mediaId },
    select: { id: true, name: true, aliases: true, imageUrl: true },
  });

  let created = 0;
  let updatedImg = 0;
  let skipped = 0;

  for (const person of cast) {
    if (!person?.name || !person.name.trim()) continue;
    const cleanName = person.name.trim();
    const incomingAliases = (person.aliases ?? []).filter(Boolean);

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

      const mergedAliases = Array.from(
        new Set([...existingChar.aliases, ...incomingAliases].filter((a) => a !== existingChar.name)),
      );
      if (mergedAliases.length !== existingChar.aliases.length) {
        updates.aliases = mergedAliases;
        existingChar.aliases = mergedAliases;
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
        mediaId,
        name: cleanName,
        aliases: incomingAliases,
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

  console.log(`[DB] ${title}: +${created} karakter baru, ${updatedImg} gambar diperbarui, ${skipped} sudah ada.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
