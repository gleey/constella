/**
 * Audit Fandom wiki resolution across the whole catalog.
 *
 * Reports, for every media row that already has characters, whether its wiki
 * resolves to a dedicated wiki, a hub-wiki section, or nothing at all. This is
 * the tool to run after touching src/lib/fandom.ts — a change that "fixes" one
 * series often silently breaks another, and this makes that visible.
 *
 * It passes the same title forms the production pipeline passes
 * (english + romaji + synonyms), so the numbers reflect real behaviour. Running
 * it with `[]` instead would under-report, because romaji-named wikis are only
 * matchable via the romaji title.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/audit-wiki-resolution.ts [--min-chars=5]
 */

import { prisma } from "../src/lib/prisma";
import { fetchMediaDetail, mediaTitleForms } from "../src/lib/anilist";
import { resolveFandomWikiSubdomain } from "../src/lib/fandom";

async function main() {
  const args = process.argv.slice(2);
  const minCharsArg = args.find((a) => a.startsWith("--min-chars="));
  const minChars = minCharsArg ? parseInt(minCharsArg.split("=")[1], 10) : 5;

  const medias = await prisma.media.findMany({
    select: {
      anilistId: true,
      title: true,
      type: true,
      _count: { select: { characters: true } },
    },
  });
  const list = medias.filter((m) => m._count.characters > 0);
  console.log(`Auditing wiki resolution for ${list.length} media with characters...`);

  let resolved = 0;
  let hub = 0;
  let unresolved = 0;
  const unresolvedRows: string[] = [];
  const hubRows: string[] = [];

  for (let i = 0; i < list.length; i++) {
    const media = list[i];
    let titleForms: string[] = [];
    try {
      titleForms = mediaTitleForms(await fetchMediaDetail(media.anilistId));
    } catch {
      titleForms = [];
    }

    const subdomain = await resolveFandomWikiSubdomain(media.title, titleForms);

    if (!subdomain) {
      unresolved++;
      if (media._count.characters >= minChars) {
        unresolvedRows.push(
          `NULL\t${media.anilistId}\t${media.type}\t${media._count.characters}ch\t${media.title}`,
        );
      }
    } else if (subdomain.includes("#")) {
      hub++;
      hubRows.push(`HUB\t${media.anilistId}\t${media.type}\t${media.title}\t=> ${subdomain}`);
    } else {
      resolved++;
    }

    if ((i + 1) % 25 === 0) {
      console.error(
        `${i + 1}/${list.length} resolved=${resolved} hub=${hub} unresolved=${unresolved}`,
      );
    }
  }

  console.log(
    `\n=== TOTALS  resolved=${resolved}  hub=${hub}  unresolved=${unresolved}  (of ${list.length}) ===`,
  );

  console.log(`\n=== UNRESOLVED (>= ${minChars} characters): ${unresolvedRows.length} ===`);
  unresolvedRows.forEach((row) => console.log(row));

  console.log(`\n=== HUB WIKI: ${hubRows.length} ===`);
  hubRows.forEach((row) => console.log(row));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
