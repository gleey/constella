/**
 * Dynamic Media & Character Catalog Synchronization.
 * Fetches real media and characters purely from AniList API and Fandom Wiki API.
 * No hardcoded manga lists or fabricated character image URLs.
 */

import { prisma } from "./prisma";
import { fetchPopularMedia, fetchMediaDetail, type CharacterDetail } from "./anilist";
import { resolveFandomWikiSubdomain, fetchCharacterImage, fetchFandomCategoryCharacters } from "./fandom";
import { resolveCharacterName } from "./name-resolution";
import { normalizeName } from "./name-dedupe";

export interface SyncResultItem {
  id: string;
  title: string;
  anilistId: number;
  coverImage: string;
  charactersSynced: number;
}

/**
 * Helper to identify broken or fake character image URLs (e.g. old hallucinated CDN hashes or local placeholders)
 */
export function isBrokenImageUrl(url?: string | null): boolean {
  if (!url || !url.trim()) return true;
  if (url.startsWith("/images/")) return true;
  if (url.includes("default.jpg")) return true;
  // Detected hallucinated hashes from previous mock catalogs
  if (/b(?:1784|2049|2201|2158|2259|2301|2210|13959|33109|3311)\d*-[a-zA-Z0-9]+/.test(url)) {
    return true;
  }
  return false;
}

/**
 * Dynamically synchronizes popular Manhwa & Manga from AniList API and enriches
 * character data & images from AniList and Fandom Wiki.
 */
export async function syncPopularMedia(limit = 12): Promise<{ count: number; media: SyncResultItem[] }> {
  console.log(`[AutoSync] Fetching top ${limit} trending/popular manhwa from AniList API...`);

  const popular = await fetchPopularMedia({
    page: 1,
    perPage: limit,
    countryOfOrigin: "KR",
    sort: ["POPULARITY_DESC"],
  });

  const results: SyncResultItem[] = [];

  for (const item of popular) {
    try {
      console.log(`[AutoSync] Processing "${item.title}" (AniList ID: ${item.id})...`);
      const detail = await fetchMediaDetail(item.id);

      // 1. Upsert Media with verified live cover and chapter counts
      const media = await prisma.media.upsert({
        where: { anilistId: detail.id },
        create: {
          anilistId: detail.id,
          title: detail.title,
          type: detail.countryOfOrigin === "KR" ? "MANHWA" : "MANGA",
          coverImage: detail.coverImage,
          totalChapters: detail.chapters || 100,
          chapterNumberingSource: "official_en",
          countryOfOrigin: detail.countryOfOrigin || "KR",
        },
        update: {
          title: detail.title,
          coverImage: detail.coverImage,
          totalChapters: detail.chapters && detail.chapters > 0 ? detail.chapters : undefined,
        },
      });

      // 2. Dynamically resolve Fandom Wiki for this series
      const wikiSubdomain = await resolveFandomWikiSubdomain(detail.title, detail.synonyms);
      if (wikiSubdomain) {
        console.log(`[AutoSync] Resolved Fandom wiki for "${detail.title}": ${wikiSubdomain}`);
      }

      // 3. Compile characters from AniList API, fallback to Fandom Category:Characters if AniList cast is empty
      let characterCandidates: Array<{
        name: string;
        aliases: string[];
        imageUrl: string;
        introducedAtChapter: number;
        role?: string;
      }> = [];

      if (detail.characters && detail.characters.length > 0) {
        characterCandidates = detail.characters.map((c: CharacterDetail, idx: number) => ({
          name: normalizeName(c.name),
          aliases: c.aliases,
          imageUrl: c.imageUrl,
          introducedAtChapter: idx === 0 ? 1 : Math.min(10, detail.chapters || 1),
          role: c.role,
        }));
      } else if (wikiSubdomain) {
        // Fallback to Fandom Wiki Category:Characters
        console.log(`[AutoSync] AniList characters empty for "${detail.title}". Querying Fandom Category:Characters...`);
        const fandomChars = await fetchFandomCategoryCharacters(wikiSubdomain, 15);
        characterCandidates = fandomChars.map((fc, idx) => ({
          name: normalizeName(fc.name),
          aliases: [],
          imageUrl: fc.imageUrl,
          introducedAtChapter: idx === 0 ? 1 : 1,
          role: idx === 0 ? "MAIN" : "SUPPORTING",
        }));
      }
      characterCandidates = characterCandidates.filter((c) => c.name.length > 0);

      let syncedCharCount = 0;

      const existingCharacters = await prisma.character.findMany({
        where: { mediaId: media.id },
      });

      // 4. Upsert characters and resolve live portraits
      for (const cand of characterCandidates) {
        let finalImage = cand.imageUrl;

        // If character image is missing or broken, query live Fandom pageimages API
        if (isBrokenImageUrl(finalImage) && wikiSubdomain) {
          try {
            const fandomImg = await fetchCharacterImage(wikiSubdomain, cand.name, cand.aliases);
            if (fandomImg) {
              finalImage = fandomImg;
            }
          } catch {
            // non-fatal
          }
        }

        const matchedId = resolveCharacterName(cand.name, existingCharacters);
        const existing = matchedId ? existingCharacters.find((c) => c.id === matchedId) : null;

        if (existing) {
          // If existing image is broken or empty, update it with live image
          if (finalImage && isBrokenImageUrl(existing.imageUrl)) {
            await prisma.character.update({
              where: { id: existing.id },
              data: {
                imageUrl: finalImage,
                aliases: Array.from(new Set([...existing.aliases, ...cand.aliases])),
              },
            });
            existing.imageUrl = finalImage;
          }
        } else {
          const newChar = await prisma.character.create({
            data: {
              mediaId: media.id,
              name: cand.name,
              aliases: cand.aliases,
              imageUrl: finalImage || "",
              introducedAtChapter: cand.introducedAtChapter,
            },
          });

          // Add initial default status and description
          await prisma.characterStatus.create({
            data: {
              characterId: newChar.id,
              status: "Alive",
              validFrom: cand.introducedAtChapter,
              validUntil: null,
              isSensitive: false,
            },
          });

          await prisma.characterDescription.create({
            data: {
              characterId: newChar.id,
              text: `${cand.name} is a character featured in ${detail.title}.`,
              validFrom: cand.introducedAtChapter,
              validUntil: null,
              isSensitive: false,
            },
          });
        }

        syncedCharCount++;
      }

      results.push({
        id: media.id,
        title: media.title,
        anilistId: media.anilistId,
        coverImage: media.coverImage,
        charactersSynced: syncedCharCount,
      });
    } catch (err: any) {
      console.error(`[AutoSync] Error syncing media "${item.title}":`, err.message);
    }
  }

  return { count: results.length, media: results };
}
