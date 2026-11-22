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
          // "Shiro (Classroom of the Elite)" or "Helmut Zemo (Marvel Cinematic Universe)"
          // which are NOT series overview pages.
          const parenContent = match.match(/\(([^)]+)\)$/)?.[1]?.toLowerCase() || "";

          // On VSBattles specifically, be extra strict:
          // Only accept pages that are clearly series/franchise pages (have "(Verse)" suffix)
          // OR are exact title matches for long titles (>= 10 chars) without any parenthetical suffix.
          // Short single-word titles like "Shark", "Helmut", "Passion" almost always match unrelated characters.
          if (hub === "vsbattles") {
            // Use word-boundary check to avoid "universe" matching "verse"
            const isVersePage = /\bverse\b/.test(parenContent);
            const isLongExact = normM === normTarget && normTarget.length >= 10 && !parenContent;
            if (!isVersePage && !isLongExact) continue;
          } else {
            // For non-VSBattles hubs, reject character pages with parenthetical suffixes
            const isCharacterPage = parenContent && !/\bverse\b/.test(parenContent) && !parenContent.includes("series");
            if (isCharacterPage) continue;

            // For short or single-word titles (<= 10 chars, no space), skip hub matching entirely.
            // Single-word titles like "Happiness", "PASSION", "Shark" are too ambiguous on
            // multi-series hub wikis — they frequently match unrelated series with the same name.
            if (normTarget.length <= 10 && !t.includes(" ")) continue;
          }

          // Strict matching to prevent false positives:
          // 1. Exact match (normalized) — e.g. "God of Blackfield" === "God of Blackfield"
          // 2. For VSBattles, accept "(Verse)" suffix matches — e.g. "Dorohedoro (Verse)"
          // 3. For titles >= 10 chars, allow substring match only if the match title
          //    is NOT a character name from a different franchise.
          //    This prevents "orange" → "ORANGE_MARMALADE" and "Shark" → "Shark" false positives.
          const isExact = normM === normTarget;
          const isVerseMatch = /\bverse\b/.test(parenContent) &&
            normM.includes(normTarget) &&
            !parenContent;

          // For long titles (>= 10 chars), allow fuzzy match only if target is fully contained
          // in the match AND the match doesn't look like a character from another franchise
          const isLongMatch =
            normTarget.length >= 10 &&
            normM.includes(normTarget) &&
            !parenContent && // no parenthetical suffix for fuzzy matches
            // Reject if match is much longer than target (likely a different series)
            normM.length <= normTarget.length + 15;

          if (isExact || isVerseMatch || isLongMatch) {
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
 * Verify that a Fandom wiki actually contains content about the given series.
 * Checks whether the wiki has a Category:Characters page or a page matching the series title.
 * This prevents false positives where a wiki subdomain exists but is about an unrelated topic.
 */
/**
 * MediaWiki signals a non-existent page with `missing: ""` — an EMPTY STRING,
 * which is falsy. Naive checks like `!page.missing` therefore treat every
 * missing page as existing. This helper tests for the *presence* of the key.
 */
function isMissingPage(page: unknown): page is undefined {
  if (!page || typeof page !== "object") return true;
  const p = page as { missing?: unknown; invalid?: unknown };
  // `missing` / `invalid` may be "" (empty string), true, or absent entirely.
  if ("missing" in p && p.missing !== undefined) return true;
  if ("invalid" in p && p.invalid !== undefined) return true;
  return false;
}

/**
 * Prove that a candidate wiki actually covers the requested series.
 *
 * `Category:Characters` alone is NOT sufficient — plenty of unrelated wikis have
 * such a category. The wiki must additionally expose either a page named after
 * the series (in any known title form) or a character category whose members
 * include a series-title page.
 */
async function verifyWikiHasSeriesContent(
  subdomain: string,
  seriesTitle: string,
  synonyms: string[] = []
): Promise<boolean> {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normTitle = normalize(seriesTitle);
  if (!normTitle) return false;

  const headers = { "User-Agent": "SpoilerFreeMap/1.0" };

  // Subtitle-style titles ("Series: Subtitle", "Series - Subtitle") bury the
  // franchise root under several subtitle words, but a dedicated wiki usually
  // names its series page after the root alone ("Chiikawa", not "Chiikawa:
  // Nanka Chiisakute Kawaii Yatsu"). Add that root as an extra title form so
  // verification can find the page. Only the leading segment is used, so this
  // never invents an unrelated name.
  const rootForm = seriesTitle.split(/\s*[:\u2013\u2014]\s*|\s+-\s+/)[0]?.trim();
  const titleForms = [seriesTitle, rootForm, ...synonyms]
    .filter((t): t is string => Boolean(t && t.trim()) && !isNonLatinTitle(t))
    .slice(0, 5);

  try {
    // 1. Does a page named after the series (or a synonym) exist here?
    for (const t of titleForms) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const pageParams = new URLSearchParams({
          action: "query",
          titles: t,
          redirects: "1",
          format: "json",
        });
        const pageRes = await fetch(`${apiUrl(subdomain)}?${pageParams}`, {
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!pageRes.ok) continue;
        const pageJson = await pageRes.json();
        const pageObj = pageJson?.query?.pages || {};
        const pageExists = Object.values(pageObj).some((p) => !isMissingPage(p));
        if (pageExists) return true;
      } catch {
        // Try the next title form.
      }
    }

    // 2. Fall back to a search for the series title inside the wiki. The hit
    //    title must contain the *whole* series title (or a synonym) — a hit
    //    that merely shares one word is a coincidence, not coverage.
    for (const t of titleForms.slice(0, 2)) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const searchParams = new URLSearchParams({
          action: "query",
          list: "search",
          srsearch: t,
          srlimit: "5",
          format: "json",
        });
        const searchRes = await fetch(`${apiUrl(subdomain)}?${searchParams}`, {
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!searchRes.ok) continue;
        const searchJson = await searchRes.json();
        const hits: Array<{ title?: string }> = searchJson?.query?.search || [];
        const targetNorm = normalize(t);
        // A full containment match is always reliable. For a looser partial
        // match, only the *distinctive* tokens count and ALL of them must
        // appear — otherwise a page sharing one common word ("Thor'zarck" for
        // "The Color of the End", "Battle" for "Phantom Blood") would pass.
        const distinctiveTokens = titleTokens(t).filter(isDistinctiveAnchor);
        const meaningfulHit = hits.some((h) => {
          const titleNorm = normalize(h?.title || "");
          if (titleNorm.includes(targetNorm)) return true;
          if (distinctiveTokens.length === 0) return false;
          const hitTokens = titleTokens(h?.title || "");
          return distinctiveTokens.every((tok) =>
            hitTokens.some((ht) => tokensMatch(ht, tok)),
          );
        });
        if (meaningfulHit) return true;
      } catch {
        // Try the next title form.
      }
    }
  } catch {
    // If verification fails, assume not relevant.
  }

  return false;
}

// ---------------------------------------------------------------------------
// Cross-wiki discovery via Fandom's official unified-search service.
//
// The legacy `www.fandom.com/api/v1/Search/CrossWiki` endpoint is behind
// Cloudflare and returns a "Just a moment..." challenge to server-side callers.
// `services.fandom.com/unified-search/page-search` is the endpoint the Fandom
// site itself uses and answers plain JSON, so we can discover the *actual*
// dedicated wiki for a series instead of brute-forcing subdomain guesses.
// ---------------------------------------------------------------------------

const FANDOM_UNIFIED_SEARCH = "https://services.fandom.com/unified-search/page-search";

/**
 * Markers that identify aggregator / meta wikis (dubbing databases, crossover
 * fanon, versus-debate wikis, ...). These frequently rank high for a series
 * query but are never that series' own character wiki.
 */
const GENERIC_WIKI_MARKERS = [
  "dubbing", "doblaje", "voice over", "voice-over", "voiceover", "voice actors",
  "fanon", "crossover", "shipping", "lost episode", "creepypasta", "tropedia",
  "trope", "versus", "vs battles", "vsbattles", "character stats", "power listing",
  "powerlisting", "heroes", "villains", "best tv shows", "animanga", "historica",
  "civilization", "wikia database", "fictional", "headcanon", "saimoe", "respect thread",
  "battle wiki", "comic vine", "wiki database", "encyclopedia", "everything",
  // Multi-webtoon aggregators collect many series under one wiki, so their
  // name is never a single series ("Villain to Kill (Webtoons) Wiki"). Without
  // this they beat the real dedicated wiki because every series' distinctive
  // token ("villainess" ~ "villain") appears in their name.
  "webtoons",
];

/**
 * Subdomain suffixes that single-series wikis use when the bare title slug is
 * already taken by a different work. "Bastard" the manhwa lives at
 * "bastard-webtoon" because "bastard" is the 1990s manga.
 */
const DISAMBIG_SUFFIXES = ["-webtoon", "-manhwa", "-manhwa-webtoon", "-manga", "-comic", "-series", "-webcomic", "-novel"];

interface AggregatedWiki {
  subdomain: string;
  sitename: string;
  score: number;
  exactPageTitles: string[];
  hub: string;
  hitCount: number;
  /**
   * True when the wiki's identity was established by a decisive signal (its
   * name or subdomain equals the series title, or equals a known synonym).
   * Those need no further proof. Weak fuzzy matches do.
   */
  decisive: boolean;
}

/**
 * Candidates where an exact title-identity match is still not enough, because
 * the same name exists on several wikis (hub pages, other franchises) and we
 * must pick the one that actually covers *this* series.
 *
 * Priority:
 *   1. A disambiguated dedicated wiki ("bastard-webtoon") — when one exists,
 *      the bare slug ("bastard") almost certainly belongs to a different work
 *      that claimed it first.
 *   2. Any other dedicated wiki whose content actually mentions the series.
 *   3. A hub page named exactly like the series (last resort — hubs are
 *      aggregator wikis and only give a small section's worth of characters).
 */
async function resolveDisambiguatedCandidates(
  ranked: AggregatedWiki[],
  seriesTitle: string,
  synonyms: string[],
): Promise<string | null> {
  const disambiguated = ranked.filter((w) =>
    DISAMBIG_SUFFIXES.some((sfx) => w.subdomain.endsWith(sfx)),
  );
  const otherDedicated = ranked.filter(
    (w) =>
      !(HUB_WIKIS as readonly string[]).includes(w.subdomain) &&
      !DISAMBIG_SUFFIXES.some((sfx) => w.subdomain.endsWith(sfx)),
  );
  const hubs = ranked.filter((w) => (HUB_WIKIS as readonly string[]).includes(w.subdomain));

  if (disambiguated.length === 0 && hubs.length === 0) return null;

  // 1 & 2: verify dedicated wikis, disambiguated ones first.
  const pool = [...disambiguated, ...otherDedicated].slice(0, 4);
  const verified: AggregatedWiki[] = [];
  for (const w of pool) {
    const ok = await verifyWikiHasSeriesContent(w.subdomain, seriesTitle, synonyms);
    if (ok) verified.push(w);
  }

  if (verified.length > 0) {
    // Prefer a verified disambiguated wiki; then strongest identity score;
    // ties go to the more specific (longer) subdomain.
    verified.sort((a, b) => {
      const aD = DISAMBIG_SUFFIXES.some((sfx) => a.subdomain.endsWith(sfx)) ? 1 : 0;
      const bD = DISAMBIG_SUFFIXES.some((sfx) => b.subdomain.endsWith(sfx)) ? 1 : 0;
      if (aD !== bD) return bD - aD;
      return b.score - a.score || b.subdomain.length - a.subdomain.length;
    });
    return verified[0].subdomain;
  }

  // 3: no dedicated wiki proved coverage — fall back to the highest-scoring
  // hub page (admitted only when it carries a page named exactly like the
  // series, which is the coverage proof by construction).
  const bestHub = hubs.sort((a, b) => b.score - a.score)[0];
  if (bestHub) {
    const pageTitle = bestHub.exactPageTitles[0];
    if (pageTitle) return `${bestHub.subdomain}#${pageTitle.replace(/\s+/g, "_")}`;
  }
  return null;
}

/** Normalize a title for comparison: lowercase, ASCII, alphanumeric + spaces. */
function normalizeTitleForMatch(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MATCH_STOPWORDS = new Set([
  "the", "of", "a", "an", "and", "to", "in", "on", "is", "are", "my", "me",
  "i", "at", "with", "for", "from", "wa", "no", "ni", "de", "mo",
]);

/** Meaningful tokens of a title (drops stopwords and very short fragments). */
function titleTokens(raw: string): string[] {
  return normalizeTitleForMatch(raw)
    .split(" ")
    .filter((t) => t.length > 2 && !MATCH_STOPWORDS.has(t));
}

function isNonLatinTitle(raw: string): boolean {
  return /^[\p{Script=Han}\p{Script=Hangul}\p{Script=Katakana}\p{Script=Hiragana}\p{Script=Thai}]/u.test(raw || "");
}

function isGenericAggregatorWiki(sitename: string, subdomain: string): boolean {
  const haystack = `${sitename} ${subdomain.replace(/-/g, " ")}`.toLowerCase();
  return GENERIC_WIKI_MARKERS.some((marker) => haystack.includes(marker));
}

/**
 * Words too generic to identify a series on their own. A wiki whose name only
 * shares one of these with a title (e.g. "Memories Wiki" for "Memories of
 * Emanon") is almost certainly unrelated.
 */
const GENERIC_ANCHOR_WORDS = new Set([
  "memories", "memory", "inside", "outside", "happiness", "happy", "shark",
  "passion", "love", "life", "world", "story", "stories", "tales", "chronicle",
  "chronicles", "legend", "legends", "hero", "heroes", "villain", "villainess",
  "school", "academy", "friends", "adventures", "adventure", "magic", "power",
  "game", "games", "dream", "dreams", "night", "dark", "light", "blood", "death",
  "king", "queen", "prince", "princess", "knight", "sword", "demon", "dragon",
  "angel", "devil", "god", "gods", "monster", "ghost", "spirit", "star", "stars",
  "moon", "sun", "sky", "fire", "water", "earth", "wind", "soul", "heart",
  "time", "days", "day", "three", "one", "two", "first", "last", "new", "old",
  "girl", "girls", "boy", "boys", "man", "men", "woman", "women", "wife",
  "husband", "family", "home", "house", "room", "city", "town", "village",
  "kingdom", "empire", "war", "peace", "revenge", "return", "rise", "fall",
  "beginning", "end", "final", "secret", "silent", "voice", "song", "music",
  "flower", "flowers", "garden", "forest", "sea", "ocean", "island", "mountain",
  "company", "office", "work", "job", "money", "gold", "silver", "iron", "steel",
  "level", "levels", "rank", "class", "skill", "skills", "system", "status",
  "player", "players", "user", "users", "master", "lord", "lady", "sir",
  "chapter", "volume", "series", "manga", "manhwa", "manhua", "anime", "novel",
]);

/**
 * Is this word distinctive enough to identify a series by itself?
 * Requires a reasonable length and rejects common English / genre vocabulary.
 */
function isDistinctiveAnchor(word: string): boolean {
  if (word.length < 4) return false;
  if (GENERIC_ANCHOR_WORDS.has(word)) return false;
  return true;
}

interface FandomSearchHit {
  subdomain: string;
  sitename: string;
  pageTitle: string;
  hub: string;
  /** Fandom vertical for the wiki: "anime", "tv", "games", "books", ... */
  wikiHub: string;
}

/** One unified-search request, memoized for 12h. Never throws. */
async function fandomUnifiedSearch(query: string, limit = 20): Promise<FandomSearchHit[]> {
  const cacheKey = `fandom:usearch:${query.toLowerCase().trim()}`;
  const cached = cacheGet<FandomSearchHit[]>(cacheKey);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const params = new URLSearchParams({
      query: query.trim(),
      lang: "en",
      namespace: "0",
      limit: String(limit),
    });
    const res = await fetch(`${FANDOM_UNIFIED_SEARCH}?${params}`, {
      headers: { "User-Agent": "SpoilerFreeMap/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return [];

    const json = await res.json();
    const hits: FandomSearchHit[] = [];
    const seen = new Set<string>();
    for (const r of json?.results ?? []) {
      try {
        const subdomain = new URL(r.url).hostname.replace(/\.fandom\.com$/i, "");
        if (!subdomain) continue;
        const key = `${subdomain}::${r.title || ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({
          subdomain,
          sitename: r.sitename || "",
          pageTitle: r.title || "",
          hub: r.hub || "",
          wikiHub: r.wikiHub || "",
        });
      } catch {
        // Malformed URL — ignore this result.
      }
    }
    cacheSet(cacheKey, hits, FANDOM_CACHE_TTL);
    return hits;
  } catch {
    return [];
  }
}

/**
 * Do two tokens refer to the same name? Exact match, or a shared prefix long
 * enough to be meaningful ("komi" ↔ "komisan", "tomo" ↔ "tomochan").
 */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4) {
    return a.startsWith(b) || b.startsWith(a);
  }
  return false;
}

/**
 * Score how strongly a candidate wiki identity matches the series title.
 * Returns `null` when the wiki cannot plausibly be the same work.
 *
 * Two independent signals are required, so that a wiki sharing one common word
 * ("Memories Wiki", "Inside Wiki", "AlexWiki", "Hungry Shark Wiki") is rejected
 * while genuine romaji wikis ("Komi-san wa Komyushou Desu Wiki", "Oyasumi
 * Punpun Wiki", "Tomo-chan wa Onnanoko Wikia") are accepted:
 *
 *   1. At least one *distinctive* series token appears in the wiki identity.
 *   2. The wiki name carries information beyond the matched title words — i.e.
 *      it is not merely a bare subset of the title ("AlexWiki" for "BJ Alex").
 */
function scoreWikiIdentity(
  seriesTitle: string,
  seriesTokens: string[],
  sitename: string,
  subdomain: string,
  synonymTokens: string[][] = [],
): number | null {
  const siteClean = normalizeTitleForMatch(sitename.replace(/\bwiki\b|\bwikia\b/gi, ""));
  const hostClean = subdomain.replace(/-/g, " ");
  const titleClean = normalizeTitleForMatch(seriesTitle);
  if (!siteClean && !hostClean) return null;

  const wikiTokens = `${siteClean} ${hostClean}`.split(" ").filter(Boolean);

  // Signal 1: an exact full-title match is decisive.
  if (siteClean === titleClean || hostClean === titleClean) return 120;

  // Signal 2: an exact match against a known synonym (romaji title, alternate
  // translation) is equally decisive — this is how "Komi Can't Communicate"
  // finds the "Komi-san wa Komyushou Desu Wiki".
  for (const synTokens of synonymTokens) {
    if (synTokens.length === 0) continue;
    const covered = synTokens.filter((t) => wikiTokens.some((w) => tokensMatch(w, t)));
    if (covered.length === synTokens.length) return 115;
  }

  // Signal 3: single-word titles are the highest-risk case ("Shark" vs "Hungry
  // Shark Wiki", "BJ Alex" vs the generic "AlexWiki"). Only an exact identity
  // match is trustworthy here; anything else is a coincidence.
  if (seriesTokens.length <= 1) return null;

  // Signal 4: at least one distinctive series token must appear in the wiki name.
  const matchedSeriesTokens = seriesTokens.filter((t) =>
    wikiTokens.some((w) => tokensMatch(w, t)),
  );
  const distinctiveHits = matchedSeriesTokens.filter(isDistinctiveAnchor);
  if (distinctiveHits.length === 0) return null;

  const coverage = matchedSeriesTokens.length / seriesTokens.length;

  // Signal 4b: a subdomain that is *exactly* the series' distinctive leading
  // token is that series' own wiki. Subtitle-style titles ("Chiikawa: Nanka
  // Chiisakute Kawaii Yatsu", "JoJo's Bizarre Adventure Part 1: Phantom Blood")
  // bury the franchise name under several subtitle words, so coverage stays low
  // even for the correct wiki. But a wiki hosted at precisely that leading token
  // is very rarely a coincidence, so treat it as strong evidence rather than
  // demanding full coverage. Long-token guard keeps this from being generic.
  const hostAsSlug = hostClean.replace(/\s+/g, "");
  const leadingToken = distinctiveHits[0];
  if (
    seriesTokens.length >= 2 &&
    leadingToken &&
    leadingToken.length >= 5 &&
    hostAsSlug === leadingToken
  ) {
    return 80;
  }

  // Signal 5: a long wiki name that only brushes one title word is unrelated
  // ("The Yellow-Haired Villain ... Wants Happiness Wiki" for "Happiness").
  if (coverage < 0.5 && distinctiveHits.length < 2) {
    if (wikiTokens.length > seriesTokens.length + 4) return null;
  }

  let score = 0;
  score += Math.round(coverage * 60);
  score += distinctiveHits.length * 12;
  if (coverage === 1 && seriesTokens.length >= 2) score += 20;

  return score;
}

/**
 * Discover a series' dedicated Fandom wiki through Fandom's own search index.
 * Returns a plain subdomain ("solo-leveling") or a hub target ("webtoon#PIGPEN").
 */
export async function discoverWikiViaUnifiedSearch(
  seriesTitle: string,
  synonyms: string[] = [],
): Promise<string | null> {
  if (!seriesTitle || isNonLatinTitle(seriesTitle)) return null;

  // De-duplicate the title list first. Callers routinely pass the series title
  // again as one of the synonyms (english + romaji + synonyms all mixed), and a
  // duplicate would otherwise consume one of the three query slots — that alone
  // made "Komi Can't Communicate" fail even though its romaji form resolves it.
  const seenForms = new Set<string>();
  const titleForms: string[] = [];
  for (const form of [seriesTitle, ...synonyms]) {
    const trimmed = (form || "").trim();
    if (!trimmed || isNonLatinTitle(trimmed)) continue;
    const key = trimmed.toLowerCase();
    if (seenForms.has(key)) continue;
    seenForms.add(key);
    titleForms.push(trimmed);
  }

  const queries = titleForms.slice(0, 3);
  if (queries.length === 0) return null;

  const seriesTokens = titleTokens(seriesTitle);
  if (seriesTokens.length === 0) return null;

  // Tokenized synonyms let the scorer recognise romaji / alternate titles
  // (e.g. "Komi-san wa Komyushou Desu" for "Komi Can't Communicate"). The series
  // title itself is excluded: it is already covered by the exact-match signals,
  // and letting it in as a "synonym" would let a single-word title pass the
  // single-word guard ("Shark" matching the "Hungry Shark Wiki").
  const seriesKey = normalizeTitleForMatch(seriesTitle);
  const synonymTokens = titleForms
    .filter((form) => normalizeTitleForMatch(form) !== seriesKey)
    .map((form) => titleTokens(form))
    .filter((t) => t.length > 0);

  // Every title form we can match a page name against.
  const allTitleForms = titleForms;

  const pageMatchesAnyTitle = (pageTitle: string): boolean => {
    const pageNorm = normalizeTitleForMatch(pageTitle);
    const pageTok = titleTokens(pageTitle).join(" ");
    return allTitleForms.some(
      (t) =>
        normalizeTitleForMatch(t) === pageNorm ||
        (pageTok.length > 0 && titleTokens(t).join(" ") === pageTok),
    );
  };

  const byWiki = new Map<string, AggregatedWiki>();

  for (const query of queries) {
    const hits = await fandomUnifiedSearch(query);
    for (const hit of hits) {
      if (!hit.subdomain) continue;

      const pageIsExact = pageMatchesAnyTitle(hit.pageTitle);

      // Non-English wikis (webtoon.fandom.com/de, /es, ...) surface as the
      // same subdomain; their casts are not usable for an English catalog.
      const url = (hit as { url?: string }).url || "";
      if (/\/\/[^/]+\.fandom\.com\/[a-z]{2}\//i.test(url)) continue;

      // Wikis from unrelated verticals (a TV show, game or band sharing the
      // series' name) can otherwise win on an exact name match and import the
      // wrong franchise's cast — exactly how the Bastard manhwa ended up with
      // the "Bastard!!" manga cast. Hub whitelists are exempt: they aggregate
      // anime/webtoon content by construction.
      const isHub = (HUB_WIKIS as readonly string[]).includes(hit.subdomain);
      if (!isHub) {
        const vertical = (hit.wikiHub || hit.hub || "").toLowerCase();
        if (vertical && !vertical.includes("anime") && !vertical.includes("comic") && !vertical.includes("book")) {
          continue;
        }
      }

      // Hub wikis (webtoon, vsbattles, ...) are shared by thousands of series, so
      // their sitename never matches a series title. They are only usable when
      // they carry a page named exactly like the series.
      if (isHub) {
        if (!pageIsExact) continue;
        const existingHub = byWiki.get(hit.subdomain);
        if (existingHub) {
          existingHub.hitCount += 1;
          if (!existingHub.exactPageTitles.includes(hit.pageTitle)) {
            existingHub.exactPageTitles.push(hit.pageTitle);
          }
        } else {
          byWiki.set(hit.subdomain, {
            subdomain: hit.subdomain,
            sitename: hit.sitename,
            score: 70,
            exactPageTitles: [hit.pageTitle],
            hub: hit.hub,
            hitCount: 1,
            // A hub is only accepted when it carries a page named exactly like
            // the series, which is decisive on its own.
            decisive: true,
          });
        }
        continue;
      }

      if (isGenericAggregatorWiki(hit.sitename, hit.subdomain)) continue;

      const identityScore = scoreWikiIdentity(
        seriesTitle,
        seriesTokens,
        hit.sitename,
        hit.subdomain,
        synonymTokens,
      );

      // NOTE: an exactly-matching page title is NOT sufficient evidence on its
      // own. Multi-series wikis (animax, isekai, otome-isekai, mysingingmonsters)
      // all host pages named after individual series, so accepting "page exists"
      // as identity lets them through as if they were dedicated wikis. Romaji-
      // named wikis ("Yagate Kimi ni Naru Wiki" for "Bloom Into You") are instead
      // recovered by the synonym signal above, because callers pass AniList
      // synonyms — that is the only trustworthy way to link the two names.
      if (identityScore === null) continue;

      // Scores >= 115 come only from the exact-name and exact-synonym signals.
      const isDecisive = identityScore >= 115;

      const existing = byWiki.get(hit.subdomain);
      if (existing) {
        existing.hitCount += 1;
        existing.score = Math.max(existing.score, identityScore);
        existing.decisive = existing.decisive || isDecisive;
        if (pageIsExact && !existing.exactPageTitles.includes(hit.pageTitle)) {
          existing.exactPageTitles.push(hit.pageTitle);
        }
      } else {
        byWiki.set(hit.subdomain, {
          subdomain: hit.subdomain,
          sitename: hit.sitename,
          score: identityScore,
          exactPageTitles: pageIsExact ? [hit.pageTitle] : [],
          hub: hit.hub,
          hitCount: 1,
          decisive: isDecisive,
        });
      }
    }
  }

  const ranked = Array.from(byWiki.values())
    .map((w) => ({
      ...w,
      // A wiki that has a page named exactly like the series is almost certainly it.
      score: w.score + (w.exactPageTitles.length > 0 ? 30 : 0) + Math.min(w.hitCount, 5),
    }))
    .sort((a, b) => b.score - a.score);

  // Minimum confidence before we accept a discovery. Weak candidates fall
  // through to the legacy subdomain-probing path instead of being trusted.
  const MIN_SCORE = 55;

  // Ambiguity gate: when several wikis claim the exact title identity (e.g. the
  // "Bastard" manga wiki vs the "bastard-webtoon" manhwa wiki vs the webtoon
  // hub page), a plain name match cannot tell them apart. Resolve among them
  // first — a disambiguated subdomain or a hub page wins over the bare slug,
  // which otherwise "decisively" resolves to the wrong franchise and imports
  // its entire cast.
  const titleKey = normalizeTitleForMatch(seriesTitle);
  const exactCandidates = ranked.filter(
    (w) =>
      w.score >= MIN_SCORE &&
      ((HUB_WIKIS as readonly string[]).includes(w.subdomain) ||
        normalizeTitleForMatch(w.sitename.replace(/\bwiki\b|\bwikia\b/gi, "")) === titleKey ||
        w.subdomain.replace(/-/g, " ") === titleKey),
  );
  if (exactCandidates.length > 1) {
    const resolvedAmbiguity = await resolveDisambiguatedCandidates(
      exactCandidates,
      seriesTitle,
      synonyms,
    );
    if (resolvedAmbiguity) return resolvedAmbiguity;
  }

  for (const candidate of ranked.slice(0, 3)) {
    if (candidate.score < MIN_SCORE) break;

    // Hub wikis need a concrete page title to be useful.
    if ((HUB_WIKIS as readonly string[]).includes(candidate.subdomain)) {
      const pageTitle = candidate.exactPageTitles[0];
      if (pageTitle) return `${candidate.subdomain}#${pageTitle.replace(/\s+/g, "_")}`;
      continue;
    }

    // Validate the wiki actually exists and carries content.
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(
        `https://${candidate.subdomain}.fandom.com/api.php?action=query&meta=siteinfo&siprop=general|statistics&format=json`,
        { headers: { "User-Agent": "SpoilerFreeMap/1.0" }, signal: controller.signal },
      );
      clearTimeout(timeoutId);
      if (!res.ok) continue;

      const json = await res.json();
      const sitename: string = json?.query?.general?.sitename || "";
      const articles: number = json?.query?.statistics?.articles || 0;
      if (!sitename) continue;
      if (isGenericAggregatorWiki(sitename, candidate.subdomain)) continue;

      // A wiki with no articles cannot supply characters.
      if (articles < 5) continue;

      // Identity was established by an exact name/synonym match, or by a hub
      // page titled exactly like the series — no further proof needed.
      //
      // A fuzzy match (partial token overlap) is different: it must additionally
      // prove it covers this series by exposing a page or category for it. This
      // is what keeps multi-series wikis (animax, isekai, mysingingmonsters) out
      // while allowing romaji-named dedicated wikis ("Komi-san wa Komyushou Desu
      // Wiki" for "Komi Can't Communicate") through — their *name* is the
      // synonym, but they never have a page titled with the English name.
      if (!candidate.decisive) {
        const siteNorm = normalizeTitleForMatch(sitename.replace(/\bwiki\b|\bwikia\b/gi, ""));
        const isExactName =
          siteNorm === normalizeTitleForMatch(seriesTitle) ||
          candidate.subdomain.replace(/-/g, " ") === normalizeTitleForMatch(seriesTitle);

        if (!isExactName) {
          const verified = await verifyWikiHasSeriesContent(
            candidate.subdomain,
            seriesTitle,
            synonyms,
          );
          if (!verified) continue;
        }
      }

      return candidate.subdomain;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

/**
 * Dynamically discover or verify the Fandom wiki subdomain for a series title and its synonyms.
 * Probes candidate MediaWiki endpoints via siteinfo without any hardcoding.
 */
export async function resolveFandomWikiSubdomain(
  seriesTitle: string,
  synonyms: string[] = [],
  minAnilistCharacters = 0,
): Promise<string | null> {
  const cacheKey = `${seriesTitle.toLowerCase().trim()}::${minAnilistCharacters}`;
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

  // 2. Cross-wiki discovery via Fandom's own search index. This finds the real
  //    dedicated wiki (e.g. "komisan", "bj-alex", "the-tutorial-is-too-hard")
  //    instead of guessing subdomains, and is far cheaper than probing dozens
  //    of candidates. Falls through to probing when nothing is confident.
  const discovered = await discoverWikiViaUnifiedSearch(seriesTitle, synonyms);
  if (discovered && !discovered.includes("#")) {
    wikiSubdomainCache.set(cacheKey, discovered);
    return discovered;
  }
  // A hub section is a weak result: keep looking through legacy probing for a
  // dedicated wiki, and only fall back to the hub when probing finds nothing.

  const cleanTitle = (raw: string) =>
    raw
      .replace(/['']/g, "")
      .replace(/,/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/\[[^\]]*\]/g, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // strip diacritics: Pokémon → Pokemon, Märchen → Marchen
      .replace(/ñ/g, "n")
      .replace(/ç/g, "c")
      .trim();

  const toSlug = (str: string) =>
    str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const toNoHyphen = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, "");

  const cleaned = cleanTitle(seriesTitle);
  const candidates: string[] = [];

  // Generate romanization variants for common Japanese vowel patterns.
  // Many Fandom wikis use romaji subdomains with doubled vowels (e.g. "haikyuu" not "haikyu",
  // "yuuyuu" not "yuyu", "shuumatsu" not "shumatsu"). Also handle "ou"→"o", "uu"→"u" reverse.
  const generateRomajiVariants = (slug: string): string[] => {
    const variants: string[] = [];
    // Double single vowels: a→aa, i→ii, u→uu, e→ee, o→oo
    // Only apply to the last word segment (most romaji doubling is on final vowel)
    const parts = slug.split("-");
    if (parts.length > 0) {
      const last = parts[parts.length - 1];
      const otherParts = parts.slice(0, -1).join("-");
      // Try doubling the last vowel if the word ends in a single vowel
      const m = last.match(/([aiueo])([^aiueo]*)$/);
      if (m) {
        const doubled = last.replace(/([aiueo])([^aiueo]*)$/, (match, v, rest) => v + v + rest);
        variants.push(otherParts ? `${otherParts}-${doubled}` : doubled);
      }
      // "ou" → "o" (e.g. "shuumatsukoukoku" might be "shumatsukokoku")
      if (last.includes("ou")) {
        variants.push(otherParts ? `${otherParts}-${last.replace(/ou/g, "o")}` : last.replace(/ou/g, "o"));
      }
    }
    return variants;
  };

  // Acronyms (e.g., "The Beginning After the End" -> "tbate", "Omniscient Reader's Viewpoint" -> "orv")
  // A bare acronym can collide with a completely unrelated wiki that merely spells the same
  // initials ("Inside Mari" -> "mari" hits a 2-page dead wiki; "Mission In the Apocalypse" ->
  // "mia" hits M.I.A. the rapper). Collect them so they can be held to content verification.
  const acronymCandidates: string[] = [];
  const allWords = cleaned.split(/\s+/).filter(Boolean);
  if (allWords.length > 1) {
    acronymCandidates.push(allWords.map((w) => w[0]?.toLowerCase()).join(""));
  }
  const nonStopWords = allWords.filter((w) => !["the", "of", "a", "an", "and"].includes(w.toLowerCase()));
  if (nonStopWords.length > 1) {
    acronymCandidates.push(nonStopWords.map((w) => w[0]?.toLowerCase()).join(""));
  }
  candidates.push(...acronymCandidates);

  // Full slug and variations
  const baseSlug = toSlug(cleaned);
  candidates.push(baseSlug);
  candidates.push(toNoHyphen(cleaned));

  // Romaji variants: try doubled vowels and "ou"→"o" conversions
  // e.g. "haikyu" → "haikyuu", "baki" → "bakii", etc.
  for (const variant of generateRomajiVariants(baseSlug)) {
    candidates.push(variant);
  }
  for (const variant of generateRomajiVariants(toNoHyphen(cleaned))) {
    candidates.push(variant);
  }

  // Progressive truncation: try shorter versions of multi-word slugs
  // e.g. "grand-blue-dreaming" → "grand-blue", "welcome-to-demon-school-iruma-kun" → "welcome-to-demon-school"
  // This handles cases where Fandom wikis use truncated series titles
  if (baseSlug.includes("-")) {
    const slugParts = baseSlug.split("-").filter(Boolean);
    if (slugParts.length >= 3) {
      // Try progressively shorter versions (remove last word each time)
      for (let len = slugParts.length - 1; len >= 2; len--) {
        candidates.push(slugParts.slice(0, len).join("-"));
      }
    }
  }

  // Unicode normalization is handled in cleanTitle (NFD decomposition).
  // baseSlug and toNoHyphen(cleaned) already use ASCII-normalized text.
  // For synonyms that might contain accented characters, also generate ASCII variants inline.

  // Distinctive last word: for titles like "Goodnight Punpun" where the wiki is just "punpun",
  // try the last word as a standalone candidate. These are deprioritized (added to shortAcronyms)
  // to be tried only after all full-slug candidates have been exhausted, and are accepted only
  // under very strict verification to avoid mega-franchise false positives like "pokemon" or "friends".
  const COMMON_WORDS = new Set([
    "adventures", "friends", "hero", "heroes", "school", "academy", "love", "war", "world", "life",
    "story", "tales", "chronicles", "legends", "dream", "dreams", "magic", "power", "powers",
    "game", "games", "online", "fantasy", "romance", "comedy", "drama", "action", "mystery",
    "monster", "monsters", "dragon", "dragons", "demon", "demons", "angel", "angels", "god", "gods",
    "king", "kings", "queen", "queens", "prince", "princess", "knight", "knights", "samurai", "ninja",
  ]);
  const lastWordCandidates: string[] = [];
  if (allWords.length >= 2) {
    const lastWord = allWords[allWords.length - 1];
    const lastSlug = toSlug(lastWord);
    if (lastSlug.length >= 4 && !COMMON_WORDS.has(lastSlug)) {
      lastWordCandidates.push(lastSlug);
      lastWordCandidates.push(toNoHyphen(lastWord));
    }
    // Also try first word for cases like "Homunculus" (single wiki matches first word)
    const firstWord = allWords[0];
    const firstSlug = toSlug(firstWord);
    if (firstSlug.length >= 4 && firstSlug !== lastSlug && !COMMON_WORDS.has(firstSlug)) {
      lastWordCandidates.push(firstSlug);
    }
  }

  // Single-word candidates (acronyms and last-word fallbacks) are dangerous because they can match
  // huge unrelated franchise wikis ("pokemon", "friends", "marvel", etc.). See below for the set,
  // built once every acronym (title + synonyms) has been collected.

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

    // Romaji variants for synonyms too
    for (const variant of generateRomajiVariants(synSlug)) {
      candidates.push(variant);
    }
    for (const variant of generateRomajiVariants(toNoHyphen(cSyn))) {
      candidates.push(variant);
    }

    const synWords = cSyn.split(/\s+/).filter(Boolean);
    if (synWords.length > 1) {
      const acr = synWords.map((w) => w[0]?.toLowerCase()).join("");
      acronymCandidates.push(acr);
      candidates.push(acr);
    }
    const synNonStopWords = synWords.filter((w) => !["the", "of", "a", "an", "and"].includes(w.toLowerCase()));
    if (synNonStopWords.length > 1) {
      const acr = synNonStopWords.map((w) => w[0]?.toLowerCase()).join("");
      acronymCandidates.push(acr);
      candidates.push(acr);
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

  // Single-word candidates (acronyms and last-word fallbacks) are dangerous because they can match
  // huge unrelated franchise wikis ("pokemon", "friends", "marvel", etc.). Acronyms especially: a
  // 2-4 letter candidate can coincide with an unrelated wiki sharing those initials ("Inside Mari"
  // -> "mari", "Mission In the Apocalypse" -> "mia" = M.I.A. the rapper), so they must prove coverage
  // via content, not just spelling. Built here so title AND synonym acronyms are all included.
  const singleWordCandidates = new Set([...lastWordCandidates, ...acronymCandidates]);

  // Last-word candidates are tried after everything else (they're low-priority fallbacks)
  const uniqueCandidates = [...longCandidates, ...shortAcronyms, ...lastWordCandidates];

  let bestCand: string | null = null;
  let maxArticles = -1;
  let bestVerified = false;

  // Probing dozens of guessed subdomains is the slow path. Give it a hard time
  // budget so a full-catalog sweep cannot stall on unresolvable series.
  const probeDeadline = Date.now() + 20_000;

  for (const cand of uniqueCandidates) {
    try {
      // Stop probing once the budget is exhausted; whatever we have wins.
      if (Date.now() > probeDeadline) break;

      // Single-word candidates (last-word fallbacks) must pass strict verification:
      // the sitename/mainpage must contain the EXACT word or the series title,
      // and the wiki must not be a mega-franchise that happens to share a word.
      const isSingleWordFallback = singleWordCandidates.has(cand);

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
          // Matching is done on whole WORDS, not substrings — a naive `.includes()` lets an
          // acronym like "teou" match "The Epics of Uuruk" (t-e-o-u substring) and lets a
          // common word like "blood" match any "Blood Wiki".
          const mainpage: string = json.query.general.mainpage || "";
          const siteNorm = normalizeTitleForMatch(sitename.replace(/\bwiki\b|\bwikia\b/gi, ""));
          const mainNorm = normalizeTitleForMatch(mainpage.replace(/\bwiki\b|\bwikia\b/gi, ""));
          const nameWords = new Set([...siteNorm.split(" "), ...mainNorm.split(" ")].filter(Boolean));

          const wordsMatch = (token: string) =>
            [...nameWords].some((w) => tokensMatch(w, token));

          // A bare acronym ("gos", "teou") is relevant only when the wiki's name initials
          // spell it out AND the wiki is named after this work, not merely containing the
          // letters in order. "gOS Wiki" → "gos" qualifies; "The Epics of Uuruk" → "teou" does
          // not, because the leading "The"/"of" are just connective words in a longer title.
          const initials = [...nameWords].map((w) => w[0]).join("");
          const acronymRelevant =
            initials === cand ||
            // Tolerate a leading "the" in the wiki name: "The GOS Wiki".
            initials === `the${cand}`;

          const titleWordTokens = toSlug(seriesTitle)
            .split("-")
            .filter((t) => t.length > 2 && !MATCH_STOPWORDS.has(t));
          const candWordTokens = cand.split("-").filter((t) => t.length > 2);

          const isRelevant =
            acronymRelevant ||
            titleWordTokens.some(wordsMatch) ||
            candWordTokens.some(wordsMatch) ||
            siteNorm === normalizeTitleForMatch(seriesTitle);

          // For short acronyms (<= 4 chars), require strict relevance
          if (cand.length <= 4 && !isRelevant) continue;

          // For single-word fallbacks (e.g. "punpun", "pokemon"), require that the sitename
          // is specifically about this series — not a mega-franchise that shares a word.
          if (isSingleWordFallback) {
            const slugTitle = toSlug(seriesTitle);
            const exactWordMatch = siteNorm === cand.toLowerCase() ||
              siteNorm === `${cand.toLowerCase()} wiki` ||
              siteNorm.replace(/\s+/g, "-").includes(slugTitle) ||
              mainNorm.replace(/\s+/g, "-").includes(slugTitle);
            // If the exact title isn't in the sitename, only accept small single-word wikis
            // (< 1000 articles) where the sitename actually contains the word.
            // This prevents mega-franchises like "pokemon" (38k articles) or "friends" (1.6k)
            // while allowing genuine small wikis like "punpun" (143 articles).
            const isSmallDistinctiveWiki = articles < 1000 &&
              ([...nameWords].some((w) => tokensMatch(w, cand.toLowerCase())));
            if (!exactWordMatch && !isSmallDistinctiveWiki) continue;

            // A single-word/acronym candidate with almost no articles is a dead wiki, not a
            // usable source — "mari" (a 2-page empty wiki) would otherwise pass only because
            // its name matches. Real single-word wikis ("punpun" 143, "tbate" 1k+) have content.
            if (articles < 10) continue;
          }

          // For longer candidates that pass relevance, also do content-based verification
          const isVerified = isRelevant
            ? await verifyWikiHasSeriesContent(cand, seriesTitle, synonyms)
            : articles > 500; // big wikis get benefit of the doubt if relevant

          // Single-word fallbacks additionally require content verification to pass
          if (isSingleWordFallback && !isVerified) continue;

          // Prefer verified results over unverified ones
          if (isVerified && !bestVerified) {
            bestCand = cand;
            maxArticles = articles;
            bestVerified = true;
            continue;
          }

          // If we already have a verified result, only replace with another verified one that's bigger
          if (bestVerified && !isVerified) continue;

          if (articles > maxArticles) {
            maxArticles = articles;
            bestCand = cand;
            if (articles > 500 && isVerified) {
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

  // Hub sections carry only a handful of characters. When AniList already
  // provides a decent cast, prefer the hub only as a supplement — fall through
  // to the alt-source roster instead of replacing a good AniList cast with a
  // tiny hub list. (The hub is still better than nothing for a bare roster.)
  if (discovered && minAnilistCharacters < 10) {
    wikiSubdomainCache.set(cacheKey, discovered);
    return discovered;
  }

  // 2. Hub wiki fallback (e.g. koreanwebtoons.fandom.com)
  const hubResult = await findWikiFromHub(seriesTitle, synonyms);
  if (hubResult && minAnilistCharacters < 10) {
    wikiSubdomainCache.set(cacheKey, hubResult);
    return hubResult;
  }

  // 3. Multi-series hub wiki fallback (e.g. webtoon#PIGPEN, vsbattles#God_of_Blackfield)
  const hubProbe = await probeHubWikis(seriesTitle, synonyms);
  if (hubProbe && minAnilistCharacters < 10) {
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
  if (isMissingPage(page)) return null;

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

// ── Subpage / non-character title blocklist ─────────────────────────────
// Category listing pages ("Characters", "Main Characters") are themselves
// members of Category:Characters on many wikis (e.g. bastard-webtoon) and
// would be ingested as a fake character named "Characters".
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
  /^(main\s+)?characters?$/i,
  /^minor\s+characters?$/i,
  /^supporting\s+characters?$/i,
  /^chapters?$/i,
  /^episodes?$/i,
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

