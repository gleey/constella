/**
 * Fandom MediaWiki API client.
 * PRD 4.C step 2: fetch raw wikitext for a character page.
 */

const FANDOM_API_PATH = "/api.php";

import { cacheGet, cacheSet } from "./api-cache";

const FANDOM_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Parse wiki target that may be either a standalone subdomain ("solo-leveling")
 * or a multi-series hub target ("webtoon#PIGPEN", "vsbattles#God_of_Blackfield").
 */
export function parseWikiTarget(target: string): { subdomain: string; pageTitle?: string } {
  if (!target) return { subdomain: "" };
  const [subdomain, ...rest] = target.split("#");
  const pageTitle = rest.length > 0 ? rest.join("#").trim() : undefined;
  return {
    subdomain: (subdomain || "").trim(),
    pageTitle: pageTitle || undefined,
  };
}

/**
 * Build Fandom wiki API URL for a given wiki subdomain or target.
 * Strips any `#pageTitle` so it queries the base endpoint,
 * e.g., "solo-leveling" → "https://solo-leveling.fandom.com/api.php"
 *       "webtoon#PIGPEN" → "https://webtoon.fandom.com/api.php"
 */
function apiUrl(wikiSubdomain: string): string {
  const { subdomain } = parseWikiTarget(wikiSubdomain);
  return `https://${subdomain}.fandom.com${FANDOM_API_PATH}`;
}

// Cache discovered Fandom subdomains to avoid repeated network checks
const wikiSubdomainCache = new Map<string, string | null>();

// Curated mappings for unconventional fandom subdomains that cannot be deduced from standard rules
const KNOWN_WIKI_SUBDOMAINS: Record<string, string> = {
  "the frozen player returns": "rfp",
  "return of the frozen player": "rfp",
  "i killed the main player": "i-killed-the-player-of-the-academy",
  "i killed an academy player": "i-killed-the-player-of-the-academy",
  "i killed the player of the academy": "i-killed-the-player-of-the-academy",
  "the beginning after the end": "tbate",
  "omniscient readers viewpoint": "orv",
  "fff-class trashero": "fffclass-trashero",
  "fff class trashero": "fffclass-trashero",
  "fffclass trashero": "fffclass-trashero",
  "the perks of being an s-class heroine": "the-perks-of-being-an-sclass-heroine",
  "the perks of being an s class heroine": "the-perks-of-being-an-sclass-heroine",
  "the perks of being an sclass heroine": "the-perks-of-being-an-sclass-heroine",
  "a transmigrators privilege": "the-perks-of-being-an-sclass-heroine",
  "father unrivaled": "peerless-dad",
  "peerless dad": "peerless-dad",
  "the tutorial is too tough": "the-tutorial-is-too-hard",
  "the tutorial is too hard": "the-tutorial-is-too-hard",
  "descent of the demon master": "the-descent-of-the-demonic-master",
  "the descent of the demonic master": "the-descent-of-the-demonic-master",
  "pigpen": "webtoon#PIGPEN",
  "god of blackfield": "vsbattles#God_of_Blackfield",
  "legend of an asura the poison dragon": "asurascans#Legend_of_Asura_–_The_Venom_Dragon",
  "legend of asura the venom dragon": "asurascans#Legend_of_Asura_–_The_Venom_Dragon",
  // ── Manga overrides (verified dedicated wikis or confirmed null) ──
  "assassination classroom": "ansatsu-kyoushitsu",
  "the 100 girlfriends who really really really really really love you": "100kanojo",
  "100 girlfriends": "100kanojo",
  "yamada kun and the seven witches": "yamada-kun",
};

/**
 * Queries collective fandom hubs like koreanwebtoons.fandom.com to discover
 * dedicated wiki subdomains via |wiki=subdomain or [[w:c:subdomain:...]] tags.
 */
async function findWikiFromHub(seriesTitle: string, synonyms: string[] = []): Promise<string | null> {
  const titles = [seriesTitle, ...synonyms];
  for (const t of titles) {
    if (!t || typeof t !== "string") continue;
    // Skip non-Latin scripts
    if (/^[\p{Script=Han}\p{Script=Hangul}\p{Script=Katakana}\p{Script=Hiragana}\p{Script=Thai}]/u.test(t)) continue;
    try {
      const pageName = t.trim().replace(/\s+/g, "_");
      const wt = await fetchWikitext("koreanwebtoons", pageName);
      if (wt) {
        const wikiMatch = wt.match(/\|wiki\s*=\s*([a-zA-Z0-9-]+)/i);
        if (wikiMatch?.[1] && wikiMatch[1].trim().length > 1) {
          return wikiMatch[1].trim().toLowerCase();
        }

        const interMatch = wt.match(/\[\[w:c:([a-zA-Z0-9-]+):/i);
        if (interMatch?.[1] && interMatch[1].trim().length > 1) {
          return interMatch[1].trim().toLowerCase();
        }
      }
    } catch {}
  }
  return null;
}

const HUB_WIKIS = ["webtoon", "vsbattles", "asurascans", "koreanwebtoons"] as const;

/**
 * Probes multi-series hub wikis using OpenSearch to find pages for series
 * without dedicated wikis (e.g. webtoon#PIGPEN, vsbattles#God_of_Blackfield).
 */
export async function probeHubWikis(
  seriesTitle: string,
  synonyms: string[] = []
): Promise<string | null> {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const titles = [seriesTitle, ...synonyms].filter(Boolean);

  for (const hub of HUB_WIKIS) {
    for (const t of titles) {
      if (!t || t.length < 3) continue;
      // Skip non-Latin scripts
      if (/^[\p{Script=Han}\p{Script=Hangul}\p{Script=Katakana}\p{Script=Hiragana}\p{Script=Thai}]/u.test(t)) continue;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const url = `https://${hub}.fandom.com/api.php?action=opensearch&search=${encodeURIComponent(t)}&limit=5&format=json`;
        const res = await fetch(url, {
          headers: { "User-Agent": "SpoilerFreeMap/1.0" },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) continue;

        const [, matches] = (await res.json()) as [string, string[]];
        if (!Array.isArray(matches) || matches.length === 0) continue;

        const normTarget = normalize(t);
        for (const match of matches) {
          const normM = normalize(match);

          // Reject character/episode pages — on VSBattles, character pages look like
          // "Shiro (Classroom of the Elite)" which are NOT series overview pages.
          // Accept only if the match is a direct series title match or contains "(Verse)".
          const parenContent = match.match(/\(([^)]+)\)$/)?.[1]?.toLowerCase() || "";
          const isCharacterPage = parenContent && !parenContent.includes("verse") && !parenContent.includes("series");
          if (isCharacterPage) continue;

          if (
            normM === normTarget ||
            (normTarget.length >= 6 && normM.includes(normTarget)) ||
            (normM.length >= 6 && normTarget.includes(normM))
          ) {
            return `${hub}#${match.replace(/\s+/g, "_")}`;
          }
        }
      } catch {
        // continue to next hub or title
      }
    }
  }

  return null;
}

/**
 * Resolves static CDN URL for a File:... media title on a Fandom wiki.
 */
export async function resolveWikiFileUrl(
  wikiSubdomain: string,
  fileTitle: string
): Promise<string | null> {
  const { subdomain } = parseWikiTarget(wikiSubdomain);
  if (!subdomain || !fileTitle) return null;
  const normalizedFile = fileTitle.startsWith("File:") ? fileTitle : `File:${fileTitle}`;
  try {
    const params = new URLSearchParams({
      action: "query",
      titles: normalizedFile,
      prop: "imageinfo",
      iiprop: "url",
      format: "json",
    });
    const res = await fetch(`${apiUrl(subdomain)}?${params}`, {
      headers: { "User-Agent": "SpoilerFreeMap/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const firstPage = Object.values(data.query?.pages || {})[0] as
      | { imageinfo?: Array<{ url?: string }> }
      | undefined;
    const url = firstPage?.imageinfo?.[0]?.url;
    return typeof url === "string" ? url : null;
  } catch {
    return null;
  }
}

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

  // 1. Check known mappings first
  const toLookupKey = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  const normalizedKey = toLookupKey(seriesTitle);
  if (KNOWN_WIKI_SUBDOMAINS[normalizedKey]) {
    const res = KNOWN_WIKI_SUBDOMAINS[normalizedKey];
    wikiSubdomainCache.set(cacheKey, res);
    return res;
  }
  for (const syn of synonyms) {
    const synKey = toLookupKey(syn || "");
    if (KNOWN_WIKI_SUBDOMAINS[synKey]) {
      const res = KNOWN_WIKI_SUBDOMAINS[synKey];
      wikiSubdomainCache.set(cacheKey, res);
      return res;
    }
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

  // Colon-based subtitles: try just the part before the colon
  // e.g., "Demon Slayer: Kimetsu no Yaiba" → "demon-slayer" and "kimetsu-no-yaiba"
  if (seriesTitle.includes(":") || seriesTitle.includes("–") || seriesTitle.includes("-")) {
    const parts = seriesTitle.split(/[:–]/).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      const pClean = cleanTitle(part);
      if (pClean.length > 3) {
        candidates.push(toSlug(pClean));
        candidates.push(toNoHyphen(pClean));
      }
    }
  }

  // Common transliteration / title swaps in webtoons / manhwa / manga
  const slugSwaps: [RegExp, string][] = [
    [/that-returned/, "who-returned"],
    [/who-returned/, "that-returned"],
    [/machine$/, "mashine"],
    [/machine$/, "mashin"],
    [/cant/, "can-t"],
    [/can-t/, "cant"],
    [/isnt/, "isn-t"],
    [/isn-t/, "isnt"],
    [/swordmaster(?!s)/, "swordmasters"],
    [/main-player/, "player-of-the-academy"],
    [/player-of-the-academy/, "main-player"],
    [/an-academy-player/, "the-player-of-the-academy"],
    [/academy-player/, "player-of-the-academy"],
    [/the-frozen-player-returns/, "return-of-the-frozen-player"],
    [/frozen-player-returns/, "return-of-the-frozen-player"],
  ];
  for (const [pat, rep] of slugSwaps) {
    if (pat.test(baseSlug)) {
      candidates.push(baseSlug.replace(pat, rep));
    }
  }

  // Class/rank transformations (e.g. fff-class -> fffclass, s-class -> sclass)
  const classPatterns: [RegExp, string][] = [
    [/([a-z0-9]+)-(class|rank|grade|tier|level)/gi, "$1$2"],
    [/([a-z0-9]+)(class|rank|grade|tier|level)/gi, "$1-$2"],
  ];
  for (const [pat, rep] of classPatterns) {
    if (pat.test(baseSlug)) {
      candidates.push(baseSlug.replace(pat, rep));
    }
  }

  // Synonyms candidates
  for (const syn of synonyms) {
    if (!syn || typeof syn !== "string") continue;
    // Skip non-Latin synonyms (CJK, Thai, etc.)
    if (/^[\p{Script=Han}\p{Script=Hangul}\p{Script=Katakana}\p{Script=Hiragana}\p{Script=Thai}]/u.test(syn)) continue;
    const cSyn = cleanTitle(syn);
    if (!cSyn) continue;
    const synSlug = toSlug(cSyn);
    candidates.push(synSlug);
    candidates.push(toNoHyphen(cSyn));

    const synWords = cSyn.split(/\s+/).filter(Boolean);
    if (synWords.length > 1) {
      candidates.push(synWords.map((w) => w[0]?.toLowerCase()).join(""));
    }
    const synNonStopWords = synWords.filter((w) => !["the", "of", "a", "an", "and"].includes(w.toLowerCase()));
    if (synNonStopWords.length > 1) {
      candidates.push(synNonStopWords.map((w) => w[0]?.toLowerCase()).join(""));
    }
    for (const p of prefixes) {
      if (p.test(synSlug)) {
        candidates.push(synSlug.replace(p, ""));
      }
    }
    for (const [pat, rep] of slugSwaps) {
      if (pat.test(synSlug)) {
        candidates.push(synSlug.replace(pat, rep));
      }
    }
    for (const [pat, rep] of classPatterns) {
      if (pat.test(synSlug)) {
        candidates.push(synSlug.replace(pat, rep));
      }
    }
    // Colon splits for synonyms
    if (syn.includes(":")) {
      const parts = syn.split(":").map((p) => p.trim()).filter(Boolean);
      for (const part of parts) {
        const pClean = cleanTitle(part);
        if (pClean.length > 3) {
          candidates.push(toSlug(pClean));
          candidates.push(toNoHyphen(pClean));
        }
      }
    }
  }

  // Filter acronyms that are too short (<= 3 chars) and can match unrelated wikis;
  // only keep them if nothing else works (try longer candidates first).
  const longCandidates: string[] = [];
  const shortAcronyms: string[] = [];
  for (const c of Array.from(new Set(candidates.filter(Boolean)))) {
    if (c.length <= 3) {
      shortAcronyms.push(c);
    } else {
      longCandidates.push(c);
    }
  }
  const uniqueCandidates = [...longCandidates, ...shortAcronyms];

  let bestCand: string | null = null;
  let maxArticles = -1;

  for (const cand of uniqueCandidates) {
    try {
      // If we already found a decent match, skip short acronyms (likely false positives)
      if (cand.length <= 3 && bestCand && maxArticles >= 10) continue;

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
          const sitename: string = json.query.general.sitename || "";
          const articles = json?.query?.statistics?.articles || 0;
          // Skip tiny unrelated wikis for short acronym candidates
          if (cand.length <= 3 && articles < 15) continue;

          // Relevance check: verify the wiki sitename or mainpage relates to the series title.
          // This prevents false positives like "ac" (Assassin's Creed) for "Assassination Classroom",
          // "ge" (Greninja) for "Goodbye Eri", "moe" (Moe genre) for "Memories of Emanon", etc.
          const mainpage: string = json.query.general.mainpage || "";
          const sitenameLower = sitename.toLowerCase();
          const titleTokens = toSlug(seriesTitle).split("-").filter((t) => t.length > 2);
          const candTokens = cand.split("-").filter((t) => t.length > 2);

          // Check if sitename or mainpage contains a meaningful token from the title or candidate
          const isRelevant =
            titleTokens.some((t) => sitenameLower.includes(t) || mainpage.toLowerCase().includes(t)) ||
            candTokens.some((t) => sitenameLower.includes(t) || mainpage.toLowerCase().includes(t)) ||
            sitenameLower.includes(toSlug(seriesTitle)) ||
            toSlug(seriesTitle).includes(sitenameLower.replace(/\s+/g, "-"));

          // For short acronyms (<= 4 chars), require strict relevance — the sitename must contain
          // a token from the title to avoid matching large unrelated wikis (e.g. "ac" → Assassin's Creed)
          if (cand.length <= 4 && !isRelevant) continue;

          // For longer candidates, allow if it's a big wiki but still prefer relevant ones
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

  // 2. Hub wiki fallback (e.g. koreanwebtoons.fandom.com)
  const hubResult = await findWikiFromHub(seriesTitle, synonyms);
  if (hubResult) {
    wikiSubdomainCache.set(cacheKey, hubResult);
    return hubResult;
  }

  // 3. Multi-series hub wiki fallback (e.g. webtoon#PIGPEN, vsbattles#God_of_Blackfield)
  const hubProbe = await probeHubWikis(seriesTitle, synonyms);
  if (hubProbe) {
    wikiSubdomainCache.set(cacheKey, hubProbe);
    return hubProbe;
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

  const { subdomain, pageTitle } = parseWikiTarget(wikiSubdomain);
  if (!subdomain) return null;

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

      const res = await fetch(`${apiUrl(subdomain)}?${params}`, {
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

  // 2. OpenSearch search for page title then query pageimages (only on dedicated wikis to avoid cross-series pollution on hubs)
  if (!pageTitle) {
    for (const cand of candidateNames.slice(0, 3)) {
      try {
        const titles = await searchPages(subdomain, cand, 3);
        const normCand = cand.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const title of titles) {
          if (title.includes("/") || title.includes(":")) continue; // avoid subpages or category pages
          const normTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (!normTitle.includes(normCand) && !normCand.includes(normTitle)) continue;

          const params = new URLSearchParams({
            action: "query",
            titles: title,
            redirects: "1",
            prop: "pageimages",
            piprop: "original|thumbnail",
            pithumbsize: "600",
            format: "json",
          });

          const res = await fetch(`${apiUrl(subdomain)}?${params}`, {
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
    redirects: "1",
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

  let json: {
    query?: {
      pages?: Array<{
        missing?: boolean;
        revisions?: Array<{
          slots?: {
            main?: {
              content?: string;
            };
          };
        }>;
      }>;
    };
  };
  try {
    json = await res.json();
  } catch {
    return null;
  }
  const page = json.query?.pages?.[0];
  if (!page || page.missing) return null;

  const content = page.revisions?.[0]?.slots?.main?.content ?? null;
  if (!content) return null;

  // If content still contains a raw redirect (e.g. double redirect or custom format), follow it
  const redirectMatch = content.match(/^#REDIRECT\s*\[\[([^\]]+)\]\]/i);
  if (redirectMatch?.[1]) {
    const targetTitle = redirectMatch[1].trim();
    if (targetTitle !== pageTitle) {
      return fetchWikitext(wikiSubdomain, targetTitle);
    }
  }

  return content;
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
  // Extract high-value relationship blocks or infobox fields before stripping
  const relBlock = wikitext.match(/(?:<!--\s*Relationships\s*-->|==+\s*(?:Relationships?|Connections?)\s*==+)[\s\S]*?(?=(?:<!--|==+|\}\}))/i);
  const infoRelMatches = wikitext.match(/\|(?:relatives?|friends?|allies|enemies?|lover|spouse|family|affiliations?|partner|master|disciple)\s*=[^|}]+/gi);

  // 1. Strip comments, ref tags, image embeds
  let text = wikitext
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi, "");

  // 2. Look for high-signal sections: Relationships, History, Biography, Overview
  const relMatch = text.match(/==+\s*(?:Relationships?|Connections?)\s*==+[\s\S]*?(?===+|$)/i);
  const histMatch = text.match(/==+\s*(?:History|Biography|Plot|Synopsis|Story|Arcs?)\s*==+[\s\S]*?(?===+|$)/i);
  const bgMatch = text.match(/==+\s*(?:Background|Overview|Personality|Appearance)\s*==+[\s\S]*?(?===+|$)/i);

  let highSignal = "";
  if (relBlock) highSignal += `\n== Infobox Relationships ==\n${relBlock[0]}\n`;
  else if (infoRelMatches) highSignal += `\n== Infobox Relationships ==\n${infoRelMatches.join("\n")}\n`;
  if (relMatch) highSignal += `\n${relMatch[0]}\n`;
  if (histMatch) highSignal += `\n${histMatch[0].slice(0, 3000)}\n`;
  if (bgMatch) highSignal += `\n${bgMatch[0].slice(0, 1500)}\n`;

  if (highSignal.trim().length > 250) {
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

  if (!foundTitle || !mainText) {
    const { subdomain, pageTitle } = parseWikiTarget(wikiSubdomain);
    if (pageTitle) {
      try {
        const hubWt = await fetchWikitext(subdomain, pageTitle);
        if (hubWt) {
          const namesToTry = [name, ...aliases].filter(Boolean);
          for (const n of namesToTry) {
            const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const sectionRegex = new RegExp(
              `={2,4}\\s*${esc}\\s*={2,4}\\s*\\n([\\s\\S]*?)(?=(?:\\n={2,4}[^=]+={2,4})|$)`,
              "i"
            );
            const match = hubWt.match(sectionRegex);
            if (match && match[1]?.trim()) {
              return {
                title: `${pageTitle}#${n}`,
                wikitext: match[1].trim(),
              };
            }
          }
        }
      } catch {
        // ignore
      }
    }
    return null;
  }

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
  } catch {
    // Non-fatal, keep mainText
  }

  return { title: foundTitle, wikitext: mainText };
}

export interface FandomCharacterSummary {
  name: string;
  imageUrl: string;
}

// ── Subpage / non-character title patterns to filter out ─────────────
const SKIP_TITLE_PATTERNS = [
  /\bcategory:/i,
  /\blist of\b/i,
  /\/gallery$/i,
  /\/image gallery$/i,
  /\/relationships$/i,
  /\/relationship$/i,
  /\/abilities$/i,
  /\/history$/i,
  /\/synopsis$/i,
  /\/quotes$/i,
  /\/trivia$/i,
];

function isCharacterTitle(title: string): boolean {
  return !SKIP_TITLE_PATTERNS.some((re) => re.test(title));
}

/**
 * Extracts character names and images from multi-series hub wikitext pages.
 * Handles <gallery> links, Level 3/4 subsections, bullet lists, and synopsis mentions.
 */
export function extractCharactersFromWikitext(
  wikitext: string
): Array<{ name: string; imageUrl?: string }> {
  const characters: Array<{ name: string; imageUrl?: string }> = [];
  const seen = new Set<string>();

  function add(name: string, img = "") {
    if (!name) return;
    const clean = name.replace(/['\[\]]/g, "").trim();
    if (!clean || clean.length < 2 || clean.length > 60) return;
    const lower = clean.toLowerCase();
    const skip = [
      "characters", "main characters", "supporting characters", "minor characters",
      "villains", "antagonists", "summary", "synopsis", "episodes", "navigation",
      "external links", "references", "trivia", "gallery", "powers and abilities",
      "soldiers", "see also", "icon", "banner", "logo", "plot", "series", "notes",
      "overview", "story", "status", "webtoon", "manhwa", "manga", "novel", "author", "artist"
    ];
    if (skip.includes(lower)) return;
    if (seen.has(lower)) return;
    seen.add(lower);
    characters.push({ name: clean, imageUrl: img });
  }

  // 1. Character section isolation (stop at next == Section ==)
  const charSectionMatch = wikitext.match(
    /(?:^|\n)==\s*(?:Main\s+|Supporting\s+|Key\s+)?Characters?\s*==\s*\n([\s\S]*?)(?=(?:\n==(?!=)\s*[^=\n]+?\s*==)|$)/i
  );
  const sec = charSectionMatch ? charSectionMatch[1] : "";

  if (sec) {
    // Gallery links inside character section
    const galleryRegex = /<gallery[^>]*>([\s\S]*?)<\/gallery>/gi;
    let gMatch: RegExpExecArray | null;
    while ((gMatch = galleryRegex.exec(sec)) !== null) {
      const lines = gMatch[1].split("\n");
      for (const line of lines) {
        const parts = line.split("|").map((p) => p.trim());
        if (parts.length >= 2) {
          let charName = "";
          for (let i = 1; i < parts.length; i++) {
            const p = parts[i];
            if (p.startsWith("link=")) {
              charName = p.replace("link=", "").trim();
              break;
            } else if (p.startsWith("'''") || (!charName && !p.includes("="))) {
              charName = p.replace(/['\[\]]/g, "").trim();
            }
          }
          if (charName) add(charName);
        }
      }
    }

    // Subheadings === Name === or ==== Name ====
    const hRegex = /={3,4}\s*([^=\n]+?)\s*={3,4}/g;
    let h: RegExpExecArray | null;
    while ((h = hRegex.exec(sec)) !== null) {
      add(h[1]);
    }

    // Bullet points * [[Name]] or * '''Name''' or * Name:
    const bulletRegex = /\*\s*(?:\[\[(?:[^|\]]+\|)?([^\]]+)\]\]|'''([^']+)'''|([^\n:–—]+)[:–—])/g;
    let b: RegExpExecArray | null;
    while ((b = bulletRegex.exec(sec)) !== null) {
      const name = b[1] || b[2] || b[3];
      add(name);
    }
  } else {
    // If no character section, check for protagonist / hero mentions in synopsis
    const protoMatch = wikitext.match(
      /(?:sole survivor|protagonist|main character|hero|awakens)[^–—\n]*?[,:–—]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/
    );
    if (protoMatch && protoMatch[1]) {
      add(protoMatch[1]);
    }
  }

  // Infobox image association if protagonist has no image
  const infoboxImgMatch = wikitext.match(/\|image\d*\s*=\s*([^|\n<>]+\.(?:jpg|jpeg|png|webp))/i);
  if (infoboxImgMatch && characters.length > 0 && !characters[0].imageUrl) {
    characters[0].imageUrl = "File:" + infoboxImgMatch[1].trim();
  }

  return characters;
}

/**
 * Discovers character list from a multi-series hub wiki page and its sub-categories.
 */
async function fetchHubWikiCharacters(
  subdomain: string,
  pageTitle: string,
  maxResults = 500
): Promise<FandomCharacterSummary[]> {
  const results: FandomCharacterSummary[] = [];
  const seen = new Set<string>();

  function add(name: string, imageUrl = "") {
    if (!name) return;
    const clean = name.replace(/['\[\]]/g, "").trim();
    if (!isCharacterTitle(clean)) return;
    const lower = clean.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    results.push({ name: clean, imageUrl });
  }

  const cleanTitle = pageTitle.replace(/_/g, " ");
  const categoryCandidates = [
    `Category:${pageTitle}`,
    `Category:${cleanTitle}`,
    `Category:${pageTitle}_Characters`,
    `Category:${cleanTitle} Characters`,
  ];

  for (const cat of categoryCandidates) {
    try {
      const params = new URLSearchParams({
        action: "query",
        generator: "categorymembers",
        gcmtitle: cat,
        gcmlimit: "50",
        gcmnamespace: "0",
        prop: "pageimages",
        piprop: "original|thumbnail",
        pithumbsize: "600",
        format: "json",
      });
      const res = await fetch(`${apiUrl(subdomain)}?${params}`, {
        headers: { "User-Agent": "SpoilerFreeMap/1.0" },
      });
      if (res.ok) {
        const data = await res.json();
        const pages = data.query?.pages || {};
        for (const pageId of Object.keys(pages)) {
          const p = pages[pageId];
          if (!p?.title) continue;
          const title = p.title.trim();
          if (!isCharacterTitle(title)) continue;
          if (
            title.toLowerCase() === cleanTitle.toLowerCase() ||
            title.toLowerCase() === pageTitle.toLowerCase()
          ) {
            continue;
          }
          const img = p.thumbnail?.source || p.original?.source || "";
          add(title, img);
        }
      }
    } catch {}
  }

  try {
    const wt = await fetchWikitext(subdomain, pageTitle);
    if (wt) {
      const extracted = extractCharactersFromWikitext(wt);
      for (const c of extracted) {
        add(c.name, c.imageUrl);
      }
    }
  } catch {}

  // Resolve images for extracted characters
  for (const c of results) {
    if (c.imageUrl && c.imageUrl.startsWith("File:")) {
      const direct = await resolveWikiFileUrl(subdomain, c.imageUrl);
      if (direct) c.imageUrl = direct;
    } else if (!c.imageUrl) {
      const img = await fetchCharacterImage(`${subdomain}#${pageTitle}`, c.name);
      if (img) c.imageUrl = img;
    }
  }

  return results.slice(0, maxResults);
}

/**
 * Discovers character list directly from Fandom Wiki Category:Characters with live portraits.
 */
export async function fetchFandomCategoryCharacters(
  wikiSubdomain: string,
  limit = 25
): Promise<FandomCharacterSummary[]> {
  return fetchFandomCategoryCharactersPaginated(wikiSubdomain, limit);
}

/**
 * Fully-paginated Fandom category member fetch with fallback categories.
 * Loops via gcmcontinue until all pages are retrieved, filters subpages/non-characters.
 */
export async function fetchFandomCategoryCharactersPaginated(
  wikiSubdomain: string,
  maxResults = 500,
): Promise<FandomCharacterSummary[]> {
  const cacheKey = `fandom:category-paginated:${wikiSubdomain}:${maxResults}`;
  const cached = cacheGet<FandomCharacterSummary[]>(cacheKey);
  if (cached) return cached;

  const { subdomain, pageTitle } = parseWikiTarget(wikiSubdomain);
  if (!subdomain) return [];

  // Hub wiki mode: extract from series categories and wikitext
  if (pageTitle) {
    const hubResults = await fetchHubWikiCharacters(subdomain, pageTitle, maxResults);
    if (hubResults.length > 0) {
      cacheSet(cacheKey, hubResults, FANDOM_CACHE_TTL);
      return hubResults;
    }
  }

  // Dedicated wiki mode
  const categoryTitles = [
    "Category:Characters",
    "Category:Character",
    "Category:Main Characters",
  ];

  for (const categoryTitle of categoryTitles) {
    const results: FandomCharacterSummary[] = [];
    const seen = new Set<string>();
    let gcmcontinue: string | undefined;

    try {
      do {
        const params = new URLSearchParams({
          action: "query",
          generator: "categorymembers",
          gcmtitle: categoryTitle,
          gcmlimit: "50", // MediaWiki max per batch
          gcmnamespace: "0",
          prop: "pageimages",
          piprop: "original|thumbnail",
          pithumbsize: "600",
          format: "json",
        });
        if (gcmcontinue) params.set("gcmcontinue", gcmcontinue);

        const res = await fetch(`${apiUrl(subdomain)}?${params}`);
        if (!res.ok) break;

        const data = await res.json();
        const pages = data.query?.pages || {};

        for (const pageId of Object.keys(pages)) {
          const page = pages[pageId];
          if (!page?.title) continue;
          const title = page.title.trim();
          if (!isCharacterTitle(title)) continue;
          if (seen.has(title.toLowerCase())) continue;
          seen.add(title.toLowerCase());

          results.push({
            name: title,
            imageUrl: page.thumbnail?.source || page.original?.source || "",
          });
        }

        gcmcontinue = data.continue?.gcmcontinue;
      } while (gcmcontinue && results.length < maxResults);

      // If we got results from this category, cache and return
      if (results.length > 0) {
        const trimmed = results.slice(0, maxResults);
        cacheSet(cacheKey, trimmed, FANDOM_CACHE_TTL);
        return trimmed;
      }
    } catch {
      // Try next fallback category
    }
  }

  return [];
}

