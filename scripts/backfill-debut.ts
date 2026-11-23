/**
 * Backfill debut metadata for existing characters.
 *
 *  1. Characters that already carry real lore (a non-template description) are
 *     marked debutKnown = true — their chapter number came from parsing, not a guess.
 *  2. One protagonist per media, chosen by relationship degree over ALL chapters
 *     so the centered node never flips as the chapter slider moves.
 *  3. Remaining unknown debuts are looked up on the series' Fandom infobox.
 *
 * Idempotent: safe to re-run. Skips anything already known.
 *
 * Usage:
 *   npx tsx scripts/backfill-debut.ts [--max-media N] [--per-media N]
 */

import { prisma } from "../src/lib/prisma";
import {
  resolveFandomWikiSubdomain,
  fetchCharacterDebutChapter,
} from "../src/lib/fandom";
import { mediaTitleForms } from "../src/lib/anilist";

const TEMPLATE_MARKER = "is a character featured in";

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
    perMedia: get("--per-media", 40),
  };
}

async function markLoreCharactersKnown() {
  const charsWithDesc = await prisma.character.findMany({
    where: { debutKnown: false, descriptions: { some: {} } },
    select: {
      id: true,
      name: true,
      media: { select: { title: true } },
      descriptions: { select: { text: true } },
    },
  });

  const knownIds: string[] = [];
  for (const c of charsWithDesc) {
    if (c.descriptions.some((d) => !d.text.includes(TEMPLATE_MARKER))) {
      knownIds.push(c.id);
    }
  }

  for (let i = 0; i < knownIds.length; i += 500) {
    await prisma.character.updateMany({
      where: { id: { in: knownIds.slice(i, i + 500) } },
      data: { debutKnown: true },
    });
  }

  console.log(`[1/3] Lore-backed debuts marked known: ${knownIds.length}`);
}

async function assignProtagonists() {
  const [relationships, characters] = await Promise.all([
    prisma.relationship.findMany({
      select: { sourceCharacterId: true, targetCharacterId: true },
    }),
    prisma.character.findMany({
      select: { id: true, mediaId: true, name: true, introducedAtChapter: true },
    }),
  ]);

  const degree = new Map<string, number>();
  for (const r of relationships) {
    degree.set(r.sourceCharacterId, (degree.get(r.sourceCharacterId) || 0) + 1);
    degree.set(r.targetCharacterId, (degree.get(r.targetCharacterId) || 0) + 1);
  }

  const byMedia = new Map<string, typeof characters>();
  for (const c of characters) {
    const list = byMedia.get(c.mediaId) ?? [];
    list.push(c);
    byMedia.set(c.mediaId, list);
  }

  const winners: string[] = [];
  for (const [, list] of byMedia) {
    const ranked = [...list].sort(
      (a, b) =>
        (degree.get(b.id) || 0) - (degree.get(a.id) || 0) ||
        a.introducedAtChapter - b.introducedAtChapter ||
        a.name.localeCompare(b.name),
    );
    // Only media with actual relationships get a degree-based protagonist.
    if ((degree.get(ranked[0].id) || 0) > 0) winners.push(ranked[0].id);
  }

  for (let i = 0; i < winners.length; i += 500) {
    await prisma.character.updateMany({
      where: { id: { in: winners.slice(i, i + 500) } },
      data: { isProtagonist: true },
    });
  }

  console.log(`[2/3] Protagonists assigned by all-chapter degree: ${winners.length}`);
}

async function lookupWikiDebuts(maxMedia: number, perMedia: number) {
  const medias = await prisma.media.findMany({
    where: { characters: { some: { debutKnown: false } } },
    select: { id: true, title: true, anilistId: true },
    orderBy: { title: "asc" },
  });

  console.log(`[3/3] Media with unknown debuts: ${medias.length}`);

  let resolvedWikis = 0;
  let found = 0;
  let missing = 0;
  let processed = 0;

  for (const media of medias) {
    if (processed >= maxMedia) break;
    processed++;

    const subdomain = await resolveFandomWikiSubdomain(
      media.title,
      mediaTitleForms({ title: media.title }),
    );
    if (!subdomain) continue;
    resolvedWikis++;

    const unknown = await prisma.character.findMany({
      where: { mediaId: media.id, debutKnown: false },
      select: { id: true, name: true, aliases: true },
      take: perMedia,
      orderBy: { name: "asc" },
    });

    for (const char of unknown) {
      try {
        const chapter = await fetchCharacterDebutChapter(subdomain, char.name, char.aliases);
        if (chapter !== null) {
          await prisma.character.update({
            where: { id: char.id },
            data: { introducedAtChapter: chapter, debutKnown: true },
          });
          found++;
        } else {
          missing++;
        }
      } catch {
        missing++;
      }
      await sleep(250);
    }

    if (processed % 25 === 0) {
      console.log(`  … ${processed}/${Math.min(medias.length, maxMedia)} media, ${found} found`);
    }
    await sleep(800);
  }

  console.log(
    `[3/3] Done: ${resolvedWikis} wikis resolved, ${found} debuts found, ${missing} still unknown`,
  );
}

async function main() {
  const { maxMedia, perMedia } = parseArgs();
  await markLoreCharactersKnown();
  await assignProtagonists();
  await lookupWikiDebuts(maxMedia, perMedia);
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
