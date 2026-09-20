/**
 * Dynamic Fandom-Driven Character Enrichment Pipeline.
 *
 * Replaces hardcoded SERIES_CONFIG with DB-driven approach.
 * Writes parsed results to DraftIngestion for admin review (PENDING/UNRESOLVED).
 * Uses paginated Fandom category fetch + Gemini structured outputs.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/enrich-fandom.ts [options]
 *
 * Options:
 *   --mediaId=<uuid>       Process a single Media record by UUID
 *   --title=<string>       Process by Media title (fuzzy match)
 *   --all                  Process all Media with Fandom wiki (default if no --mediaId/--title)
 *   --limit=<number>       Max characters to process per media (default: 50)
 *   --auto-approve         Skip review queue: directly apply approved drafts (DANGEROUS)
 *   --dry-run              Preview only: fetch wikitext, parse, log results without DB writes
 */

import { prisma } from "../src/lib/prisma";
import { fetchMediaDetail } from "../src/lib/anilist";
import {
  fetchCharacterWikitextSmart,
  cleanWikitextForLLM,
  fetchFandomCategoryCharactersPaginated,
  resolveFandomWikiSubdomain,
} from "../src/lib/fandom";
import { parseCharacterWikitext, type GeminiParsedCharacter } from "../src/lib/gemini";
import { resolveCharacterName } from "../src/lib/name-resolution";

interface CliOptions {
  mediaId?: string;
  title?: string;
  all?: boolean;
  limit: number;
  autoApprove: boolean;
  dryRun: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const opts: CliOptions = {
    limit: 50,
    autoApprove: false,
    dryRun: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--mediaId=")) {
      opts.mediaId = arg.split("=")[1];
    } else if (arg.startsWith("--title=")) {
      opts.title = arg.split("=")[1];
    } else if (arg === "--all") {
      opts.all = true;
    } else if (arg.startsWith("--limit=")) {
      opts.limit = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--auto-approve") {
      opts.autoApprove = true;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  return opts;
}

function printUsage() {
  console.log(`
Dynamic Fandom-Driven Character Enrichment Pipeline

Usage:
  npx tsx -r dotenv/config scripts/enrich-fandom.ts [options]

Options:
  --mediaId=<uuid>       Process a single Media record by UUID
  --title=<string>       Process by Media title (fuzzy match)
  --all                  Process all Media with Fandom wiki (default if no --mediaId/--title)
  --limit=<number>       Max characters to process per media (default: 50)
  --auto-approve         Skip review queue: directly apply approved drafts (DANGEROUS)
  --dry-run              Preview only: fetch wikitext, parse, log results without DB writes
  --help, -h             Show this help

Examples:
  # Process all media in DB
  npx tsx -r dotenv/config scripts/enrich-fandom.ts --all

  # Process specific media by UUID
  npx tsx -r dotenv/config scripts/enrich-fandom.ts --mediaId=abc123 --limit=20

  # Preview without writing
  npx tsx -r dotenv/config scripts/enrich-fandom.ts --title="Omniscient Reader" --dry-run
`);
}

async function getTargetMedia(opts: CliOptions) {
  if (opts.mediaId) {
    const media = await prisma.media.findUnique({
      where: { id: opts.mediaId },
    });
    if (!media) {
      console.error(`[ERROR] Media with ID ${opts.mediaId} not found`);
      process.exit(1);
    }
    return [media];
  }

  if (opts.title) {
    const media = await prisma.media.findFirst({
      where: {
        title: {
          contains: opts.title,
          mode: "insensitive",
        },
      },
    });
    if (!media) {
      console.error(`[ERROR] No media found matching title "${opts.title}"`);
      process.exit(1);
    }
    return [media];
  }

  // Default: all media that have a fandom wiki (synonyms not empty or we can try resolving)
  const allMedia = await prisma.media.findMany({
    orderBy: { title: "asc" },
  });

  // Filter to those we can resolve a Fandom subdomain for
  const withWiki: typeof allMedia = [];
  for (const media of allMedia) {
    // Try to resolve without synonyms first; the function generates candidates from title
    const subdomain = await resolveFandomWikiSubdomain(media.title, []);
    if (subdomain) {
      withWiki.push(media);
    } else {
      console.log(`[SKIP] No Fandom wiki found for "${media.title}"`);
    }
  }

  return withWiki;
}

async function enrichMedia(
  media: Awaited<ReturnType<typeof prisma.media.findUnique>>,
  opts: CliOptions
) {
  if (!media) {
    console.error("[ERROR] Media is null");
    return;
  }

  console.log(`\n======================================================`);
  console.log(`[ENRICH] ${media.title} (AniList: ${media.anilistId})`);
  console.log(`======================================================`);

  // Fetch AniList detail for synonyms
  let anilistSynonyms: string[] = [];
  try {
    const anilistDetail = await fetchMediaDetail(media.anilistId);
    anilistSynonyms = anilistDetail.synonyms || [];
  } catch {
    console.warn("[WARN] Could not fetch AniList synonyms");
  }

  // Resolve Fandom subdomain
  const wikiSubdomain = await resolveFandomWikiSubdomain(media.title, anilistSynonyms);
  if (!wikiSubdomain) {
    console.log(`[SKIP] Could not resolve Fandom wiki subdomain for "${media.title}"`);
    return;
  }
  console.log(`[Fandom] Resolved wiki: ${wikiSubdomain}.fandom.com`);

  // Fetch all characters from Fandom category (paginated)
  console.log(`[Fandom] Fetching character list from Category:Characters...`);
  const fandomCharacters = await fetchFandomCategoryCharactersPaginated(wikiSubdomain, opts.limit);
  console.log(`[Fandom] Found ${fandomCharacters.length} potential character pages`);

  if (fandomCharacters.length === 0) {
    console.log(`[WARN] No characters found in Fandom category`);
    return;
  }

  // Load existing DB characters for name resolution
  const dbCharacters = await prisma.character.findMany({
    where: { mediaId: media.id },
    select: { id: true, name: true, aliases: true, introducedAtChapter: true },
  });
  console.log(`[DB] ${dbCharacters.length} existing characters in DB`);

  // Fetch AniList details for additional aliases/images
  let anilistDetail: Awaited<ReturnType<typeof fetchMediaDetail>> | null = null;
  try {
    anilistDetail = await fetchMediaDetail(media.anilistId);
    console.log(`[AniList] ${anilistDetail.characters.length} characters from AniList`);
  } catch (err: any) {
    console.warn(`[WARN] AniList fetch failed: ${err.message}`);
  }

  // Merge AniList characters into DB characters for better resolution
  const allKnownCharacters: Pick<typeof dbCharacters[0], "id" | "name" | "aliases">[] = [...dbCharacters];
  if (anilistDetail) {
    for (const c of anilistDetail.characters) {
      const existing = allKnownCharacters.find((db) => resolveCharacterName(c.name, [db]) !== null);
      if (!existing) {
        allKnownCharacters.push({
          id: `anilist:${c.anilistId}`,
          name: c.name,
          aliases: c.aliases,
        });
      }
    }
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const fandomChar of fandomCharacters) {
    if (processed >= opts.limit) {
      console.log(`[LIMIT] Reached --limit=${opts.limit}, stopping`);
      break;
    }

    const charName = fandomChar.name;
    console.log(`\n--- [${processed + 1}/${opts.limit}] Processing: ${charName} ---`);

    // Check if character already has a DraftIngestion (avoid duplicate work)
    const existingDraft = await prisma.draftIngestion.findFirst({
      where: {
        mediaId: media.id,
        characterName: charName,
      },
    });

    if (existingDraft && existingDraft.status !== "REJECTED") {
      console.log(`[SKIP] Draft already exists (status: ${existingDraft.status})`);
      skipped++;
      continue;
    }

    // Resolve to DB character for introducedAtChapter and better context
    const dbCharId = resolveCharacterName(charName, dbCharacters);
    const dbChar = dbCharId ? dbCharacters.find((c) => c.id === dbCharId) : null;

    // Fetch wikitext
    let wikitextResult: { title: string; wikitext: string } | null = null;
    try {
      wikitextResult = await fetchCharacterWikitextSmart(wikiSubdomain, charName, dbChar?.aliases || []);
    } catch (err: any) {
      console.warn(`[WARN] Fandom fetch failed for ${charName}: ${err.message}`);
    }

    if (!wikitextResult || wikitextResult.wikitext.length < 500) {
      console.log(`[SKIP] No substantial wikitext found for ${charName}`);
      failed++;
      continue;
    }

    const cleanedWikitext = cleanWikitextForLLM(wikitextResult.wikitext, 12000);
    console.log(`[Fandom] Got wikitext from "${wikitextResult.title}" (${cleanedWikitext.length} chars after cleaning)`);

    // Parse with Gemini structured output
    let parsed: GeminiParsedCharacter | null = null;
    try {
      console.log(`[Gemini] Parsing with structured output...`);
      parsed = await parseCharacterWikitext(
        cleanedWikitext,
        charName,
        media.chapterNumberingSource,
        media.totalChapters
      );
      console.log(`[Gemini] Parsed: introCh=${parsed.introducedAtChapter}, desc=${parsed.descriptions?.length || 0}, status=${parsed.statuses?.length || 0}, rels=${parsed.relationships?.length || 0}, facs=${parsed.factions?.length || 0}`);
    } catch (err: any) {
      console.error(`[ERROR] Gemini parsing failed for ${charName}: ${err.message}`);
      failed++;
      continue;
    }

    if (!parsed) {
      failed++;
      continue;
    }

    // Validate temporal bounds using introducedAtChapter
    const introduced = Math.min(Math.max(1, parsed.introducedAtChapter || 1), media.totalChapters);

    // Name Resolution: check relationships/factions target names against known characters
    const unresolvedNames: string[] = [];

    if (parsed.relationships) {
      for (const rel of parsed.relationships) {
        const targetId = resolveCharacterName(rel.targetName, allKnownCharacters);
        if (!targetId || targetId === dbCharId) {
          unresolvedNames.push(rel.targetName);
        }
      }
    }

    if (parsed.factions) {
      for (const fac of parsed.factions) {
        if (!fac.factionName?.trim()) {
          unresolvedNames.push(fac.factionName || "");
        }
      }
    }

    const status = unresolvedNames.length > 0 ? "UNRESOLVED" : "PENDING";

    if (opts.dryRun) {
      console.log(`[DRY-RUN] Would create DraftIngestion:`);
      console.log(`  characterName: ${charName}`);
      console.log(`  status: ${status}`);
      console.log(`  unresolvedNames: ${unresolvedNames.join(", ") || "(none)"}`);
      console.log(`  parsedJson: ${JSON.stringify(parsed, null, 2).slice(0, 500)}...`);
      processed++;
      continue;
    }

    // Create or update DraftIngestion
    if (existingDraft) {
      await prisma.draftIngestion.update({
        where: { id: existingDraft.id },
        data: {
          rawWikitext: cleanedWikitext,
          parsedJson: parsed as any,
          status,
          unresolvedNames: [...new Set(unresolvedNames)],
        },
      });
      console.log(`[DB] Updated DraftIngestion (${status}) for ${charName}`);
    } else {
      await prisma.draftIngestion.create({
        data: {
          mediaId: media.id,
          characterName: charName,
          rawWikitext: cleanedWikitext,
          parsedJson: parsed as any,
          status,
          unresolvedNames: [...new Set(unresolvedNames)],
        },
      });
      console.log(`[DB] Created DraftIngestion (${status}) for ${charName}`);
    }

    // Optionally upsert basic Character record if missing (for approval to work)
    if (!dbChar && opts.autoApprove) {
      await prisma.character.upsert({
        where: { id: "placeholder-will-be-replaced" }, // will fail, but we handle below
        create: {
          mediaId: media.id,
          name: charName,
          aliases: [],
          imageUrl: fandomChar.imageUrl || "",
          introducedAtChapter: introduced,
        },
        update: {
          imageUrl: fandomChar.imageUrl || "",
          introducedAtChapter: introduced,
        },
      }).catch(() => {}); // ignore if character exists with different ID
    }

    processed++;

    // Rate limiting
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\n[SUMMARY] ${media.title}: processed=${processed}, skipped=${skipped}, failed=${failed}`);
}

async function main() {
  const opts = parseArgs();

  console.log("Starting Dynamic Fandom-Driven Character Enrichment Pipeline");

  const targetMedia = await getTargetMedia(opts);
  console.log(`Target media count: ${targetMedia.length}`);

  for (const media of targetMedia) {
    await enrichMedia(media, opts);
  }

  console.log("\n======================================================");
  console.log("ENRICHMENT PIPELINE COMPLETE");
  console.log("======================================================");
  console.log("Next steps:");
  console.log("  - Review DraftIngestion records at /admin/review");
  console.log("  - Approve PENDING drafts to populate Character data");
  console.log("  - Resolve UNRESOLVED names then re-approve");
}

main()
  .catch((e) => {
    console.error("FATAL ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());