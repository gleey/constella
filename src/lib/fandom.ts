/**
 * Fandom MediaWiki API client.
 * PRD 4.C step 2: fetch raw wikitext for a character page.
 */

const FANDOM_API_PATH = "/api.php";

import { cacheGet, cacheSet } from "./api-cache";

const FANDOM_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Build Fandom wiki API URL for a given wiki subdomain.
 * e.g., "solo-leveling" → "https://solo-leveling.fandom.com/api.php"
 */
function apiUrl(wikiSubdomain: string): string {
  return `https://${wikiSubdomain}.fandom.com${FANDOM_API_PATH}`;
}

// Cache discovered Fandom subdomains to avoid repeated network checks
const wikiSubdomainCache = new Map<string, string | null>();

/**
 * Dynamically discover or verify the Fandom wiki subdomain for a series title and its synonyms.
 * Probes candidate MediaWiki endpoints via siteinfo without any hardcoding.
 */
export async function resolveFandomWikiSubdomain(
  seriesTitle: string,
  synonyms: string[] = []
): Promise<string | null> {
  const cacheKey = seriesTitle.toLowerCase().trim();
  if (wikiSubdomainCache.has(cacheKey)) {
    return wikiSubdomainCache.get(cacheKey) ?? null;
  }

  const cleanTitle = (raw: string) =>
    raw
      .replace(/['’]/g, "")
      .replace(/,/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/\[[^\]]*\]/g, "")
      .trim();

  const toSlug = (str: string) =>
    str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const toNoHyphen = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, "");

  const cleaned = cleanTitle(seriesTitle);
  const candidates: string[] = [];

  // Acronyms (e.g., "The Beginning After the End" -> "tbate", "Omniscient Reader's Viewpoint" -> "orv")
  const allWords = cleaned.split(/\s+/).filter(Boolean);
  if (allWords.length > 1) {
    candidates.push(allWords.map((w) => w[0]?.toLowerCase()).join(""));
  }
  const nonStopWords = allWords.filter((w) => !["the", "of", "a", "an", "and"].includes(w.toLowerCase()));
  if (nonStopWords.length > 1) {
    candidates.push(nonStopWords.map((w) => w[0]?.toLowerCase()).join(""));
  }

  // Full slug and variations
  const baseSlug = toSlug(cleaned);
  candidates.push(baseSlug);
  candidates.push(toNoHyphen(cleaned));

  // Stripped prefixes (e.g., "the-", "solo-", "im-the-", "i-am-the-", "revenge-of-the-")
  const prefixes = [/^the-/, /^solo-/, /^im-the-/, /^i-am-the-/, /^revenge-of-the-/, /^revenge-of-/];
  for (const p of prefixes) {
    if (p.test(baseSlug)) {
      candidates.push(baseSlug.replace(p, ""));
    }
  }

  // Common phrase replacements in Webtoons / Manhwa
  if (baseSlug.includes("that-returned")) {
    candidates.push(baseSlug.replace("that-returned", "who-returned"));
  }
  if (baseSlug.includes("who-returned")) {
    candidates.push(baseSlug.replace("who-returned", "that-returned"));
  }

  // Synonyms candidates
  for (const syn of synonyms) {
    if (!syn || typeof syn !== "string") continue;
    const cSyn = cleanTitle(syn);
    if (!cSyn) continue;
    const synSlug = toSlug(cSyn);
    candidates.push(synSlug);
    candidates.push(toNoHyphen(cSyn));

    const synWords = cSyn.split(/\s+/).filter(Boolean);
    if (synWords.length > 1) {
      candidates.push(synWords.map((w) => w[0]?.toLowerCase()).join(""));
    }
    for (const p of prefixes) {
      if (p.test(synSlug)) {
        candidates.push(synSlug.replace(p, ""));
      }
    }
    if (synSlug.includes("that-returned")) {
      candidates.push(synSlug.replace("that-returned", "who-returned"));
    }
    if (synSlug.includes("who-returned")) {
      candidates.push(synSlug.replace("who-returned", "that-returned"));
    }
  }

  const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));

  let bestCand: string | null = null;
  let maxArticles = -1;

  for (const cand of uniqueCandidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`https://${cand}.fandom.com/api.php?action=query&meta=siteinfo&siprop=general|statistics&format=json`, {
        headers: { "User-Agent": "SpoilerFreeMap/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        if (json?.query?.general?.sitename) {
          const articles = json?.query?.statistics?.articles || 0;
          if (articles > maxArticles) {
            maxArticles = articles;
            bestCand = cand;
            // If it's a huge established wiki (> 500 articles), accept immediately
            if (articles > 500) {
              break;
            }
          }
        }
      }
    } catch {
      // Continue to next candidate
    }
  }

  if (bestCand) {
    wikiSubdomainCache.set(cacheKey, bestCand);
    return bestCand;
  }

  wikiSubdomainCache.set(cacheKey, null);
  return null;
}

/**
 * Fetch character image directly from Fandom MediaWiki pageimages API.
 * Follows redirects and tests aliases and search matches automatically.
 */
export async function fetchCharacterImage(
  wikiSubdomain: string,
  name: string,
  aliases: string[] = []
): Promise<string | null> {
  const cacheKey = `fandom:charimg:${wikiSubdomain}:${name.toLowerCase()}`;
  const cached = cacheGet<string | null>(cacheKey);
  if (cached !== null) return cached;

  const candidateNames = Array.from(new Set([name, ...aliases].filter(Boolean)));

  // 1. Direct pageimages query with redirects=1
  for (const cand of candidateNames) {
    try {
      const params = new URLSearchParams({
        action: "query",
        titles: cand,
        redirects: "1",
        prop: "pageimages",
        piprop: "original|thumbnail",
        pithumbsize: "600",
        format: "json",
      });

      const res = await fetch(`${apiUrl(wikiSubdomain)}?${params}`, {
        headers: { "User-Agent": "SpoilerFreeMap/1.0" },
      });
      if (!res.ok) continue;

      const json = await res.json();
      const pages = json.query?.pages || {};
      for (const pageId of Object.keys(pages)) {
        if (pageId === "-1") continue;
        const p = pages[pageId];
        const src = p.original?.source || p.thumbnail?.source;
        if (src && !src.includes("default") && !src.includes("placeholder")) {
          cacheSet(cacheKey, src, FANDOM_CACHE_TTL);
          return src;
        }
      }
    } catch {
      // ignore & try next
    }
  }

  // 2. OpenSearch search for page title then query pageimages
  for (const cand of candidateNames.slice(0, 3)) {
    try {
      const titles = await searchPages(wikiSubdomain, cand, 3);
      for (const title of titles) {
        if (title.includes("/") || title.includes(":")) continue; // avoid subpages or category pages
        const params = new URLSearchParams({
          action: "query",
          titles: title,
          redirects: "1",
          prop: "pageimages",
          piprop: "original|thumbnail",
          pithumbsize: "600",
          format: "json",
        });

        const res = await fetch(`${apiUrl(wikiSubdomain)}?${params}`, {
          headers: { "User-Agent": "SpoilerFreeMap/1.0" },
        });
        if (!res.ok) continue;

        const json = await res.json();
        const pages = json.query?.pages || {};
        for (const pageId of Object.keys(pages)) {
          if (pageId === "-1") continue;
          const p = pages[pageId];
          const src = p.original?.source || p.thumbnail?.source;
          if (src && !src.includes("default") && !src.includes("placeholder")) {
            cacheSet(cacheKey, src, FANDOM_CACHE_TTL);
            return src;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Fetch raw wikitext for a page title from Fandom.
 * Returns null if page doesn't exist.
 */
export async function fetchWikitext(
  wikiSubdomain: string,
  pageTitle: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    titles: pageTitle,
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    format: "json",
    formatversion: "2",
  });

  let res: Response;
  try {
    res = await fetch(`${apiUrl(wikiSubdomain)}?${params}`);
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let json: any;
  try {
    json = await res.json();
  } catch {
    return null;
  }
  const page = json.query?.pages?.[0];
  if (!page || page.missing) return null;

  return page.revisions?.[0]?.slots?.main?.content ?? null;
}

/**
 * Search for character pages on a Fandom wiki.
 * Returns list of page titles matching the query.
 */
export async function searchPages(
  wikiSubdomain: string,
  query: string,
  limit = 10,
): Promise<string[]> {
  const params = new URLSearchParams({
    action: "opensearch",
    search: query,
    limit: String(limit),
    format: "json",
  });

  let res: Response;
  try {
    res = await fetch(`${apiUrl(wikiSubdomain)}?${params}`);
  } catch {
    return [];
  }
  if (!res.ok) return [];

  try {
    const json = await res.json();
    // OpenSearch format: [query, [titles], [descriptions], [urls]]
    return (json[1] as string[]) ?? [];
  } catch {
    return [];
  }
}

/**
 * Strips noisy MediaWiki markup and extracts high-signal sections
 * (Synopsis, History, Relationships, Background) under 5500 chars to avoid 503 spikes.
 */
export function cleanWikitextForLLM(wikitext: string, maxChars = 5500): string {
  // 1. Strip comments, ref tags, image embeds
  let text = wikitext
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi, "")
    .replace(/\{\{[^}]*\}\}/g, ""); // strip infobox / navbox templates

  // 2. Look for high-signal sections: Relationships, History, Biography, Overview
  const relMatch = text.match(/==+\s*(?:Relationships?|Connections?)\s*==+[\s\S]*?(?===+|$)/i);
  const histMatch = text.match(/==+\s*(?:History|Biography|Plot|Synopsis|Story|Arcs?)\s*==+[\s\S]*?(?===+|$)/i);
  const bgMatch = text.match(/==+\s*(?:Background|Overview|Personality|Appearance)\s*==+[\s\S]*?(?===+|$)/i);

  let highSignal = "";
  if (relMatch) highSignal += `\n${relMatch[0]}\n`;
  if (histMatch) highSignal += `\n${histMatch[0].slice(0, 3000)}\n`;
  if (bgMatch) highSignal += `\n${bgMatch[0].slice(0, 1500)}\n`;

  if (highSignal.trim().length > 400) {
    text = highSignal;
  }

  // Deduplicate newlines
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
  }
  return text;
}

/**
 * Multi-tier intelligent wikitext fetcher:
 * 1. Try exact name
 * 2. Try each alias
 * 3. Try opensearch with character name
 * 4. Try opensearch with each alias
 * 5. If found, also attempt to fetch <Title>/Relationships or <Title>/Relationship subpage
 */
export async function fetchCharacterWikitextSmart(
  wikiSubdomain: string,
  name: string,
  aliases: string[] = [],
): Promise<{ title: string; wikitext: string } | null> {
  let foundTitle: string | null = null;
  let mainText: string | null = null;

  const safeFetch = async (title: string): Promise<string | null> => {
    try {
      return await fetchWikitext(wikiSubdomain, title);
    } catch {
      return null;
    }
  };
  const safeSearch = async (q: string, limit: number): Promise<string[]> => {
    try {
      return await searchPages(wikiSubdomain, q, limit);
    } catch {
      return [];
    }
  };

  // 1. Try exact name
  try {
    const text1 = await safeFetch(name);
    if (text1) {
      foundTitle = name;
      mainText = text1;
    }
  } catch {
    // ignore, fall through to other tiers
  }

  // 2. Try aliases
  if (!foundTitle) {
    for (const alias of aliases) {
      if (!alias.trim()) continue;
      const textAlias = await safeFetch(alias);
      if (textAlias) {
        foundTitle = alias;
        mainText = textAlias;
        break;
      }
    }
  }

  // 3. Try searchPages with name
  if (!foundTitle) {
    const searchCandidates = await safeSearch(name, 3);
    for (const title of searchCandidates) {
      const textSearch = await safeFetch(title);
      if (textSearch) {
        foundTitle = title;
        mainText = textSearch;
        break;
      }
    }
  }

  // 4. Try searchPages with aliases
  if (!foundTitle) {
    for (const alias of aliases) {
      if (!alias.trim()) continue;
      const searchAlias = await safeSearch(alias, 3);
      for (const title of searchAlias) {
        const textSearch = await safeFetch(title);
        if (textSearch) {
          foundTitle = title;
          mainText = textSearch;
          break;
        }
      }
      if (foundTitle) break;
    }
  }

  if (!foundTitle || !mainText) return null;

  // 5. Check for dedicated /Relationships or /Relationship subpages
  try {
    const relText1 = await fetchWikitext(wikiSubdomain, `${foundTitle}/Relationships`);
    if (relText1) {
      mainText += `\n\n== Dedicated Relationships Subpage ==\n${relText1}`;
    } else {
      const relText2 = await fetchWikitext(wikiSubdomain, `${foundTitle}/Relationship`);
      if (relText2) {
        mainText += `\n\n== Dedicated Relationships Subpage ==\n${relText2}`;
      }
    }
  } catch (err) {
    // Non-fatal, keep mainText
  }

  return { title: foundTitle, wikitext: mainText };
}

export interface FandomCharacterSummary {
  name: string;
  imageUrl: string;
}

/**
 * Discovers character list directly from Fandom Wiki Category:Characters with live portraits.
 */
export async function fetchFandomCategoryCharacters(
  wikiSubdomain: string,
  limit = 25
): Promise<FandomCharacterSummary[]> {
  const cacheKey = `fandom:category:${wikiSubdomain}:${limit}`;
  const cached = cacheGet<FandomCharacterSummary[]>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      action: "query",
      generator: "categorymembers",
      gcmtitle: "Category:Characters",
      gcmlimit: String(limit),
      gcmnamespace: "0",
      prop: "pageimages",
      piprop: "original|thumbnail",
      pithumbsize: "600",
      format: "json",
    });

    const res = await fetch(`${apiUrl(wikiSubdomain)}?${params}`);
    if (!res.ok) return [];

    const data = await res.json();
    const pages = data.query?.pages || {};
    const results: FandomCharacterSummary[] = [];

    for (const pageId of Object.keys(pages)) {
      const page = pages[pageId];
      if (!page || !page.title) continue;
      const title = page.title.trim();
      if (title.toLowerCase().includes("category:") || title.toLowerCase().includes("list of")) continue;

      const img = page.thumbnail?.source || page.original?.source || "";
      results.push({
        name: title,
        imageUrl: img,
      });
    }

    cacheSet(cacheKey, results, FANDOM_CACHE_TTL);
    return results;
  } catch {
    return [];
  }
}

