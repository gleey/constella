/**
 * AniList GraphQL API client.
 * PRD 4.C step 1: search title, fetch media + characters.
 */

import { cacheGet, cacheSet } from "./api-cache";

const ANILIST_URL = "https://graphql.anilist.co";

// ponytail: no auth — AniList public endpoint has rate limit ~90 req/min.
// Add client credentials when rate limit becomes an issue.

const ANILIST_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

interface AniListMedia {
  id: number;
  title: { romaji: string; english: string | null; native: string | null };
  coverImage: { extraLarge?: string | null; large: string; medium?: string | null };
  bannerImage?: string | null;
  chapters: number | null;
  countryOfOrigin: string;
  format: string; // MANGA, MANHWA, etc.
  status?: string | null;
  isAdult?: boolean | null;
  genres?: string[] | null;
  description?: string | null;
  synonyms?: string[];
  characters?: {
    edges: {
      role?: string;
      node: {
        id: number;
        name: { full: string; native?: string | null; alternative?: string[]; alternativeSpoiler?: string[] };
        image: { large: string; medium?: string | null };
      };
    }[];
  };
}

export interface SearchResult {
  id: number;
  title: string;
  englishTitle: string | null;
  romajiTitle: string;
  nativeTitle: string | null;
  coverImage: string;
  chapters: number | null;
  countryOfOrigin: string;
  format: string;
  status: string;
  contentRating: "SAFE" | "SUGGESTIVE_18";
  genres: string[];
  synonyms: string[];
}

export function determineContentRating(
  isAdult?: boolean | null,
  genres?: string[] | null,
): "SAFE" | "SUGGESTIVE_18" {
  if (isAdult) return "SUGGESTIVE_18";
  if (genres && genres.length > 0) {
    const adultGenres = ["ecchi", "hentai", "erotica"];
    if (genres.some((g) => adultGenres.includes(g.toLowerCase()))) {
      return "SUGGESTIVE_18";
    }
  }
  return "SAFE";
}

export function normalizeMediaStatus(
  status?: string | null,
): "RELEASING" | "FINISHED" | "CANCELLED" | "HIATUS" {
  if (!status) return "RELEASING";
  const upper = status.toUpperCase();
  if (["RELEASING", "FINISHED", "CANCELLED", "HIATUS"].includes(upper)) {
    return upper as "RELEASING" | "FINISHED" | "CANCELLED" | "HIATUS";
  }
  return "RELEASING";
}

export interface CharacterDetail {
  anilistId: number;
  name: string;
  nativeName: string | null;
  aliases: string[];
  imageUrl: string;
  role: string;
}

export interface MediaDetail extends SearchResult {
  characters: CharacterDetail[];
}

const SEARCH_QUERY = `
query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(search: $search, sort: SEARCH_MATCH) {
      id
      title { romaji english native }
      coverImage { extraLarge large medium }
      chapters
      countryOfOrigin
      format
      status
      isAdult
      genres
      synonyms
    }
  }
}`;

const DISCOVERY_QUERY = `
query ($page: Int, $perPage: Int, $countryOfOrigin: CountryCode, $sort: [MediaSort], $status: MediaStatus) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { lastPage total }
    media(type: MANGA, sort: $sort, countryOfOrigin: $countryOfOrigin, status: $status) {
      id
      title { romaji english native }
      coverImage { extraLarge large medium }
      chapters
      countryOfOrigin
      format
      status
      isAdult
      genres
      synonyms
    }
  }
}`;

const DETAIL_QUERY = `
query ($id: Int) {
  Media(id: $id) {
    id
    title { romaji english native }
    coverImage { extraLarge large medium }
    bannerImage
    chapters
    countryOfOrigin
    format
    status
    isAdult
    genres
    synonyms
    characters(sort: [ROLE, RELEVANCE], perPage: 40) {
      edges {
        role
        node {
          id
          name { full native alternative alternativeSpoiler }
          image { large medium }
        }
      }
    }
  }
}`;

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(ANILIST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`AniList API ${res.status}: ${await res.text()}`);
      const json = await res.json();
      if (json.errors) throw new Error(`AniList: ${json.errors[0].message}`);
      return json.data;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  throw lastErr;
}

export async function searchMedia(search: string, limit = 10): Promise<SearchResult[]> {
  const data = await gql<{ Page: { media: AniListMedia[] } }>(SEARCH_QUERY, { search, page: 1, perPage: limit });
  return (data.Page?.media || []).map((m) => ({
    id: m.id,
    title: m.title.english ?? m.title.romaji,
    englishTitle: m.title.english,
    romajiTitle: m.title.romaji,
    nativeTitle: m.title.native,
    coverImage: m.coverImage.extraLarge || m.coverImage.large,
    chapters: m.chapters,
    countryOfOrigin: m.countryOfOrigin,
    format: m.format,
    status: normalizeMediaStatus(m.status),
    contentRating: determineContentRating(m.isAdult, m.genres),
    genres: m.genres || [],
    synonyms: m.synonyms || [],
  }));
}

export interface DiscoveryPage {
  results: SearchResult[];
  lastPage: number;
  total: number;
}

/**
 * Fetch one page of popular/trending manhwa/manga with pagination metadata.
 * Used by the catalog importer to walk the AniList discovery feed.
 */
export async function fetchPopularMediaPage({
  page = 1,
  perPage = 15,
  countryOfOrigin = "KR", // Korean webtoons/manhwa by default, or "JP" for manga
  sort = ["POPULARITY_DESC"],
  status,
}: {
  page?: number;
  perPage?: number;
  countryOfOrigin?: string;
  sort?: string[];
  status?: string;
} = {}): Promise<DiscoveryPage> {
  const cacheKey = `anilist:discovery-page:${page}:${perPage}:${countryOfOrigin}:${sort.join(",")}:${status || "ALL"}`;
  const cached = cacheGet<DiscoveryPage>(cacheKey);
  if (cached) return cached;

  const data = await gql<{
    Page: {
      pageInfo?: { lastPage?: number; total?: number };
      media: AniListMedia[];
    };
  }>(DISCOVERY_QUERY, {
    page,
    perPage,
    countryOfOrigin,
    sort,
    status: status || undefined,
  });

  const results = (data.Page?.media || []).map((m) => ({
    id: m.id,
    title: m.title.english ?? m.title.romaji,
    englishTitle: m.title.english,
    romajiTitle: m.title.romaji,
    nativeTitle: m.title.native,
    coverImage: m.coverImage.extraLarge || m.coverImage.large,
    chapters: m.chapters,
    countryOfOrigin: m.countryOfOrigin,
    format: m.format,
    status: normalizeMediaStatus(m.status),
    contentRating: determineContentRating(m.isAdult, m.genres),
    genres: m.genres || [],
    synonyms: m.synonyms || [],
  }));

  const result: DiscoveryPage = {
    results,
    lastPage: data.Page?.pageInfo?.lastPage || page,
    total: data.Page?.pageInfo?.total || results.length,
  };

  cacheSet(cacheKey, result, ANILIST_CACHE_TTL);
  return result;
}

/**
 * Dynamically fetch popular or trending manhwa/manga without any hardcoding.
 */
export async function fetchPopularMedia(options: {
  page?: number;
  perPage?: number;
  countryOfOrigin?: string;
  sort?: string[];
  status?: string;
} = {}): Promise<SearchResult[]> {
  const page = await fetchPopularMediaPage(options);
  return page.results;
}

export async function fetchMediaDetail(anilistId: number): Promise<MediaDetail> {
  const cacheKey = `anilist:detail:${anilistId}`;
  const cached = cacheGet<MediaDetail>(cacheKey);
  if (cached) return cached;

  const data = await gql<{ Media: AniListMedia }>(DETAIL_QUERY, { id: anilistId });
  const m = data.Media;
  const edges = m.characters?.edges || [];

  const result: MediaDetail = {
    id: m.id,
    title: m.title.english ?? m.title.romaji,
    englishTitle: m.title.english,
    romajiTitle: m.title.romaji,
    nativeTitle: m.title.native,
    coverImage: m.coverImage.extraLarge || m.coverImage.large,
    chapters: m.chapters,
    countryOfOrigin: m.countryOfOrigin,
    format: m.format,
    status: normalizeMediaStatus(m.status),
    contentRating: determineContentRating(m.isAdult, m.genres),
    genres: m.genres || [],
    synonyms: m.synonyms || [],
    characters: edges.map((edge) => {
      const c = edge.node;
      const aliasSet = new Set<string>();
      if (c.name.native) aliasSet.add(c.name.native);
      (c.name.alternative || []).forEach((a) => a && aliasSet.add(a.trim()));
      (c.name.alternativeSpoiler || []).forEach((a) => a && aliasSet.add(a.trim()));

      // Ignore default silhouette placeholder image from AniList
      const rawImg = c.image.large || c.image.medium || "";
      const validImg = rawImg.includes("default.jpg") ? "" : rawImg;

      return {
        anilistId: c.id,
        name: c.name.full,
        nativeName: c.name.native || null,
        aliases: Array.from(aliasSet),
        imageUrl: validImg,
        role: edge.role || "SUPPORTING",
      };
    }),
  };

  cacheSet(cacheKey, result, ANILIST_CACHE_TTL);
  return result;
}
