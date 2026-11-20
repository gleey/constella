import { prisma } from "@/lib/prisma";
import { fetchPopularMediaPage } from "@/lib/anilist";

export interface CatalogImportResult {
  imported: number;
  updated: number;
  skipped: number;
  pages: number;
  total: number;
}

interface ImportOptions {
  /** Country codes to pull from AniList discovery, in order. */
  countries?: string[];
  /** Maximum discovery pages per country. */
  maxPages?: number;
  perPage?: number;
}

const COUNTRY_TYPE: Record<string, string> = {
  KR: "MANHWA",
  JP: "MANGA",
  CN: "MANHUA",
  TW: "MANHUA",
};

function mediaType(countryOfOrigin: string): string {
  return COUNTRY_TYPE[countryOfOrigin] ?? "MANGA";
}

/** Only one import may run at a time; concurrent callers share the same promise. */
let inFlight: Promise<CatalogImportResult> | null = null;

/**
 * Bulk-import catalog metadata from AniList discovery.
 *
 * This deliberately imports metadata only (title, cover, chapters, type,
 * country) and never touches characters/lore, so it stays fast and does not
 * trigger thousands of Fandom or AI calls. Character enrichment keeps running
 * lazily per series through the existing admin flows.
 */
export function importCatalog({
  countries = ["KR", "JP"],
  maxPages = 6,
  perPage = 50,
}: ImportOptions = {}): Promise<CatalogImportResult> {
  if (inFlight) return inFlight;

  inFlight = runImport({ countries, maxPages, perPage }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runImport({
  countries,
  maxPages,
  perPage,
}: Required<ImportOptions>): Promise<CatalogImportResult> {
  const result: CatalogImportResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    pages: 0,
    total: 0,
  };

  for (const country of countries) {
    for (let page = 1; page <= maxPages; page++) {
      let discovery;
      try {
        discovery = await fetchPopularMediaPage({
          page,
          perPage,
          countryOfOrigin: country,
        });
      } catch (error) {
        console.error(`Catalog import failed for ${country} page ${page}:`, error);
        break;
      }

      result.pages += 1;
      result.total += discovery.results.length;

      const CONCURRENCY = 12;
      for (let i = 0; i < discovery.results.length; i += CONCURRENCY) {
        const chunk = discovery.results.slice(i, i + CONCURRENCY);
        await Promise.all(
          chunk.map(async (item) => {
            const cover = item.coverImage;
            if (!cover || !item.title) {
              result.skipped += 1;
              return;
            }

            const chapters =
              typeof item.chapters === "number" && item.chapters > 0
                ? item.chapters
                : 100;

            try {
              const existing = await prisma.media.findUnique({
                where: { anilistId: item.id },
                select: { id: true },
              });

              if (existing) {
                await prisma.media.update({
                  where: { id: existing.id },
                  data: {
                    title: item.title,
                    coverImage: cover,
                    totalChapters: chapters,
                  },
                });
                result.updated += 1;
              } else {
                await prisma.media.create({
                  data: {
                    anilistId: item.id,
                    title: item.title,
                    type: mediaType(country),
                    coverImage: cover,
                    totalChapters: chapters,
                    chapterNumberingSource: "anilist",
                    countryOfOrigin: country,
                  },
                });
                result.imported += 1;
              }
            } catch (error) {
              console.error(`Catalog import skipped "${item.title}":`, error);
              result.skipped += 1;
            }
          }),
        );
      }

      if (page >= discovery.lastPage) break;
    }
  }

  return result;
}
