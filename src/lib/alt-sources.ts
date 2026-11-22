/**
 * Secondary character-data sources used when a series has no usable Fandom wiki.
 *
 * Constella's primary source is Fandom Community Wikis (CC-BY-SA). Some series —
 * especially licensed manhwa, small manga, and BL titles — simply have no wiki.
 * For those we fall back to:
 *
 *   1. Wikipedia  — "List of <series> characters" articles and the series'
 *                   article section tree. Text is CC-BY-SA 4.0.
 *   2. Kitsu      — a community anime/manga database with per-media character
 *                   listings plus short bios and portrait images.
 *
 * Both produce plain text that is then handed to the same AI extraction
 * pipeline (Gemini/Groq/OpenRouter) used for Fandom wikitext, so the temporal
 * chapter-bounding contract is identical regardless of the source.
 */

import { cacheGet, cacheSet } from "./api-cache";

const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
const KITSU_API = "https://kitsu.io/api/edge";

/**
 * Fallback lookups are repeated once per character during a lore sync, so a
 * single series would otherwise re-download the same article or Kitsu roster
 * dozens of times. Cache the expensive results for 12 hours.
 */
const ALT_CACHE_TTL = 12 * 60 * 60 * 1000;

/** Cache wrapper for a single async lookup; `null` results are cached too. */
async function cached<T>(key: string, fn: () => Promise<T | null>): Promise<T | null> {
  const hit = cacheGet<T | null>(key);
  if (hit !== null && hit !== undefined) return hit;
  const value = await fn();
  cacheSet(key, value, ALT_CACHE_TTL);
  return value;
}

const REQUEST_HEADERS = {
  "User-Agent": "SpoilerFreeMap/1.0 (character-data research; +https://github.com/gleey/constella)",
  Accept: "application/json",
};

/**
 * Kitsu speaks JSON:API and answers HTTP 406 unless the request advertises that
 * media type, so it needs its own header set.
 */
const KITSU_HEADERS = {
  "User-Agent": "SpoilerFreeMap/1.0 (character-data research; +https://github.com/gleey/constella)",
  Accept: "application/vnd.api+json",
};

async function fetchJson(
  url: string,
  timeoutMs = 8000,
  headers: Record<string, string> = REQUEST_HEADERS,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Normalize a title for fuzzy comparison (lowercase, ASCII, alphanumeric). */
function normTitle(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNonLatin(raw: string): boolean {
  return /^[\p{Script=Han}\p{Script=Hangul}\p{Script=Katakana}\p{Script=Hiragana}\p{Script=Thai}]/u.test(raw || "");
}

/**
 * Is `candidate` a trustworthy title match for `target`?
 *
 * Single-token titles ("MIX", "Shark", "Happiness") are extremely ambiguous, so
 * they only match exactly. Multi-token titles require every meaningful token of
 * the target to be present in the candidate.
 */
function isStrongTitleMatch(target: string, candidate: string): boolean {
  const t = normTitle(target);
  const c = normTitle(candidate);
  if (!t || !c) return false;
  if (t === c) return true;

  const tTokens = t.split(" ").filter((x) => x.length > 2);
  const cTokens = c.split(" ").filter((x) => x.length > 2);

  // A one-word target must match exactly — no "Happiness" ≈ "Cyanide & Happiness".
  if (tTokens.length <= 1) return false;

  // Every meaningful target token must appear in the candidate.
  return tTokens.every((tok) => cTokens.includes(tok));
}

// ---------------------------------------------------------------------------
// Wikipedia
// ---------------------------------------------------------------------------

export interface WikipediaCharacterPage {
  /** Article title, e.g. "List of Berserk characters". */
  pageTitle: string;
  /** Article URL, for attribution. */
  url: string;
  /** Raw wikitext of the character article. */
  wikitext: string;
}

/**
 * Locate a Wikipedia character-list article for a series.
 * Tries the canonical "List of X characters" form, then the series article
 * itself (which often has a "Characters" section), then a targeted search.
 */
export async function findWikipediaCharacterPage(
  seriesTitle: string,
  synonyms: string[] = [],
): Promise<WikipediaCharacterPage | null> {
  if (!seriesTitle || isNonLatin(seriesTitle)) return null;

  const titleForms = [seriesTitle, ...synonyms].filter(
    (t): t is string => Boolean(t && t.trim()) && !isNonLatin(t),
  );
  if (titleForms.length === 0) return null;

  const cacheKey = `alt:wp:${titleForms.slice(0, 3).join("|").toLowerCase()}`;
  return cached(cacheKey, () => findWikipediaCharacterPageUncached(titleForms));
}

async function findWikipediaCharacterPageUncached(
  titleForms: string[],
): Promise<WikipediaCharacterPage | null> {
  const candidates: string[] = [];
  for (const t of titleForms.slice(0, 3)) {
    candidates.push(`List of ${t} characters`);
    candidates.push(`${t} characters`);
    candidates.push(t);
  }

  // MediaWiki accepts up to 50 pipe-separated titles per query — batch all
  // candidate titles into ONE existence check instead of ~9 sequential ones.
  const json = (await fetchJson(
    `${WIKIPEDIA_API}?${new URLSearchParams({
      action: "query",
      titles: candidates.join("|"),
      redirects: "1",
      format: "json",
      formatversion: "2",
    })}`,
  )) as { query?: { pages?: Array<{ title?: string; missing?: unknown; ns?: number }> } } | null;

  const pages = json?.query?.pages ?? [];
  // Evaluate pages in candidate order so the strongest form ("List of X
  // characters") is preferred over a bare series article.
  const orderedPages = candidates
    .map((c) => pages.find((p) => p.title?.toLowerCase() === c.toLowerCase() && p.missing === undefined && p.ns === 0))
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.title));

  for (const page of orderedPages) {
    // The article title must plausibly be about this series. This rejects
    // lookalikes such as "Cyanide & Happiness" for "Happiness" or "King Shark"
    // for "Shark".
    const titleForMatch = page.title!.replace(/^list of /i, "").replace(/ characters$/i, "");
    const matchesSeries = titleForms.some((form) => isStrongTitleMatch(form, titleForMatch));
    if (!matchesSeries) continue;

    // Only accept "List of ..." pages directly; for the bare series article we
    // still need a Characters section, which is checked below.
    const wikitext = await fetchWikipediaWikitext(page.title!);
    if (!wikitext) continue;

    const isListArticle = /^list of /i.test(page.title!);
    const hasCharactersSection = /^={2,4}\s*(?:Main |Major |Recurring |Supporting )?characters\s*={2,4}/im.test(
      wikitext,
    );
    if (!isListArticle && !hasCharactersSection) continue;

    // A usable character article must actually enumerate cast members.
    if (extractWikipediaCharacterNames(wikitext).length < 3) continue;

    return {
      pageTitle: page.title!,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title!.replace(/ /g, "_"))}`,
      wikitext,
    };
  }

  // Targeted search as a last resort.
  const searchJson = (await fetchJson(
    `${WIKIPEDIA_API}?${new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: `intitle:"${titleForms[0]}" characters`,
      srlimit: "3",
      format: "json",
      formatversion: "2",
    })}`,
  )) as { query?: { search?: Array<{ title?: string }> } } | null;

  for (const hit of searchJson?.query?.search ?? []) {
    if (!hit.title) continue;
    const titleForMatch = hit.title.replace(/^list of /i, "").replace(/ characters$/i, "");
    if (!titleForms.some((form) => isStrongTitleMatch(form, titleForMatch))) continue;

    const wikitext = await fetchWikipediaWikitext(hit.title);
    if (!wikitext) continue;
    if (extractWikipediaCharacterNames(wikitext).length < 3) continue;
    return {
      pageTitle: hit.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`,
      wikitext,
    };
  }

  return null;
}

/** Fetch raw wikitext of a Wikipedia article. */
export async function fetchWikipediaWikitext(pageTitle: string): Promise<string | null> {
  // `action=parse` is stricter about title encoding than `action=query`; titles
  // containing apostrophes or ampersands must be passed through URLSearchParams
  // exactly once, which is what we do here.
  const json = (await fetchJson(
    `${WIKIPEDIA_API}?${new URLSearchParams({
      action: "parse",
      page: pageTitle,
      prop: "wikitext",
      format: "json",
      formatversion: "2",
      redirects: "1",
    })}`,
    10000,
  )) as { parse?: { wikitext?: string }; error?: { info?: string } } | null;

  if (json?.parse?.wikitext) return json.parse.wikitext;

  // Fall back to action=query revisions, which resolves titles more leniently.
  const q = (await fetchJson(
    `${WIKIPEDIA_API}?${new URLSearchParams({
      action: "query",
      titles: pageTitle,
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      redirects: "1",
      format: "json",
      formatversion: "2",
    })}`,
    10000,
  )) as {
    query?: {
      pages?: Array<{
        missing?: unknown;
        revisions?: Array<{ slots?: { main?: { content?: string } } }>;
      }>;
    };
  } | null;

  const page = q?.query?.pages?.[0];
  if (!page || page.missing !== undefined) return null;
  return page.revisions?.[0]?.slots?.main?.content ?? null;
}

/**
 * Collective / group headings that appear as list entries but are not
 * individual characters ("Komi's family", "Class Delinquents", "Teachers").
 */
const GROUP_PATTERN = new RegExp(
  "\\b(family|families|classmates?|class|teachers?|students?|others?|staff|" +
  "crew|members?|group|groups|team|teams|organization|organisation|guild|" +
  "army|soldiers?|knights?|clan|tribe|nation|kingdom|faction|cast|" +
  "protagonists?|antagonists?|supporting|minor|major|recurring|" +
  "relatives?|parents?|siblings?|children|friends|allies|enemies|" +
  "delinquents?|gang|gangs|squad|unit|division|department|company|" +
  "school|academy|institute|hospital|city|town|village|world)\\b",
  "i",
);

/**
 * Pull the display name out of a definition-list entry.
 *
 * Handles nested templates, which are extremely common:
 *   ";{{Nihongo|{{vanchor|Shōko Komi}}|古見 硝子|Komi Shōko}}"
 *   ";{{Nihongo|Himiko Agari|上理 卑美子|Agari Himiko}}"
 *   ";'''Guts'''"
 */
function extractDisplayName(entry: string): string | null {
  // Find the first {{Nihongo|...}} / {{vanchor|...}} and take its first argument,
  // tracking nested braces so inner templates are handled correctly.
  const templateStart = entry.search(/\{\{(?:Nihongo|nihongo|vanchor|Visible anchor)\s*\|/i);
  if (templateStart >= 0) {
    const afterPipe = entry.indexOf("|", templateStart) + 1;
    let depth = 0;
    let arg = "";
    for (let i = afterPipe; i < entry.length; i++) {
      const two = entry.slice(i, i + 2);
      if (two === "{{") {
        depth++;
        i++;
        continue;
      }
      if (two === "}}") {
        if (depth === 0) break;
        depth--;
        i++;
        continue;
      }
      if (entry[i] === "|" && depth === 0) break;
      arg += entry[i];
    }
    // A nested {{vanchor|Name}} still needs its own unwrapping. After the loop,
    // `arg` may look like "vanchor|Shōko Komi" or "{{vanchor|Shōko Komi}}".
    let candidate = arg.replace(/[{}]/g, "").trim();
    const innerTemplate = candidate.match(/^[A-Za-z][A-Za-z0-9 _]*\|\s*(.+)$/);
    if (innerTemplate) candidate = innerTemplate[1].trim();
    candidate = candidate.split("|")[0].trim();
    if (candidate) return candidate;
  }

  // Plain bold or bare name: ";'''Guts'''" / "; Guts".
  const plain = entry.split(/[:–—]/)[0].replace(/'''|''/g, "").replace(/\[\[|\]\]/g, "").trim();
  if (plain && !plain.startsWith("{") && !plain.startsWith("[[")) return plain;
  return null;
}

/**
 * Extract character names from a Wikipedia character article.
 *
 * Two layouts are common:
 *   1. Level-3 headings per character — "=== Guts ===" (Berserk, Naruto, ...).
 *   2. Definition-list entries — ";{{Nihongo|Shōko Komi|古見 硝子}}" or
 *      ";'''Guts'''" (Komi Can't Communicate, many newer articles).
 *
 * Both are handled so coverage is not limited to one editorial style.
 */
export function extractWikipediaCharacterNames(wikitext: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  // NOTE: keys are compared against `normTitle(name)`, which lowercases and
  // replaces punctuation with spaces ("Live-action film" → "live action film").
  // Every entry below is normalized the same way, otherwise hyphenated headings
  // slip through and get stored as characters.
  const SKIP = new Set([
    "main characters", "major characters", "minor characters", "supporting characters",
    "recurring characters", "characters", "cast", "voice cast", "anime", "manga",
    "adaptations", "reception", "references", "external links", "see also",
    "notes", "further reading", "bibliography", "merchandise", "media",
    "first year classmates", "second year classmates", "third year classmates",
    "teachers and other students", "family members", "other characters",
    "others", "plot", "plot summary", "story", "production", "release",
    "volume list", "volumes", "chapter list", "chapters", "music", "staff",
    "video games", "live action film", "live action", "tv drama", "television drama",
    "novel", "publication", "anime adaptation", "film", "films", "drama",
    "canon content", "video game", "gummi ship", "the new 52", "sung family",
    "publication history", "development", "themes", "legacy", "impact",
    "analysis and themes", "gendered violence and the monstrous feminine",
    "body horror and abjection", "critical reception", "voice actors",
  ].map((k) => normTitle(k)));

  const addName = (raw: string) => {
    let name = raw.trim();
    // Strip templates and emphasis that wrap names.
    name = name.replace(/\{\{[^}]*\}\}/g, " ").trim();
    name = name.replace(/\[\[|\]\]|'''|''/g, "").trim();
    // Drop trailing disambiguation parentheses: "Guts (Berserk)" → "Guts".
    name = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
    name = name.replace(/\s+/g, " ").trim();
    if (!name) return;

    const key = normTitle(name);
    if (!key || SKIP.has(key)) return;
    if (name.split(/\s+/).length > 5) return;
    // Ignore anything with residual markup or reference noise.
    if (/[{}|<>]/.test(name)) return;

    // Reject group / collective headings that are not individual characters:
    // "Komi's family", "Class Delinquents", "Tadano's family", "Teachers".
    if (GROUP_PATTERN.test(key)) return;

    if (seen.has(key)) return;

    seen.add(key);
    names.push(name);
  };

  for (const line of wikitext.split("\n")) {
    // Layout 1: section heading per character.
    const heading = line.match(/^===\s*([^=]+?)\s*===$/);
    if (heading) {
      addName(heading[1]);
      continue;
    }

    // Layout 2: definition-list entry at line start.
    const def = line.match(/^;\s*(.+)$/);
    if (def) {
      const display = extractDisplayName(def[1].trim());
      if (display) addName(display);
    }
  }

  return names;
}

/**
 * Build an AI-ready text blob for one character from a Wikipedia article.
 *
 * Supports both the heading layout ("=== Guts ===" ...) and the definition-list
 * layout (";{{Nihongo|Shōko Komi|...}}" followed by ":" description lines).
 */
export function extractWikipediaCharacterSection(
  wikitext: string,
  characterName: string,
): { title: string; text: string } | null {
  const target = normTitle(characterName);
  if (!target) return null;

  const lines = wikitext.split("\n");

  // Layout 1: a heading whose text matches the character name.
  let start = -1;
  let headingLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(={2,5})\s*([^=]+?)\s*\1$/);
    if (!m) continue;
    const level = m[1].length;
    const heading = normTitle(m[2].replace(/\s*\([^)]*\)\s*$/, ""));
    if (heading === target || heading.startsWith(target) || target.startsWith(heading)) {
      start = i + 1;
      headingLevel = level;
      break;
    }
  }

  if (start >= 0) {
    const body: string[] = [];
    for (let i = start; i < lines.length; i++) {
      const m = lines[i].match(/^(={2,5})\s*([^=]+?)\s*\1$/);
      if (m && m[1].length <= headingLevel) break;
      body.push(lines[i]);
    }
    const text = body.join("\n").trim();
    if (text.length >= 60) return { title: characterName, text };
  }

  // Layout 2: a definition-list entry followed by ":" description lines.
  for (let i = 0; i < lines.length; i++) {
    const def = lines[i].match(/^;\s*(.+)$/);
    if (!def) continue;

    const display = extractDisplayName(def[1].trim());
    if (!display) continue;

    const candidateNorm = normTitle(display);
    if (!candidateNorm) continue;
    if (candidateNorm !== target && !candidateNorm.startsWith(target) && !target.startsWith(candidateNorm)) {
      continue;
    }

    // Collect the following ":" description lines until the next entry/heading.
    const body: string[] = [def[1]];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*[;=]/.test(lines[j])) break;
      body.push(lines[j]);
    }
    const text = body.join("\n").trim();
    if (text.length >= 60) return { title: characterName, text };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Kitsu
// ---------------------------------------------------------------------------

export interface KitsuCharacter {
  name: string;
  aliases: string[];
  description: string;
  imageUrl: string;
  role: string;
}

interface KitsuMediaAttributes {
  canonicalTitle?: string;
  slug?: string;
  subtype?: string;
  chapterCount?: number | null;
  startDate?: string | null;
}

/**
 * Find the Kitsu media entry matching a series title.
 *
 * Title similarity alone is not enough — short titles collide with unrelated
 * works ("Shark" → "Shark na Kanojo no Ryouiki", "MIX" → "Maker Hikoushiki
 * Hatsune Mix"). The entry must also look like the same kind of publication
 * (manga/manhwa), so novel-only or differently-shaped entries are rejected.
 */
export async function findKitsuMedia(
  seriesTitle: string,
  synonyms: string[] = [],
  expectedType: "MANGA" | "MANHWA" | "UNKNOWN" = "UNKNOWN",
): Promise<{ id: string; attributes: KitsuMediaAttributes } | null> {
  if (!seriesTitle || isNonLatin(seriesTitle)) return null;

  const titleForms = [seriesTitle, ...synonyms].filter(
    (t): t is string => Boolean(t && t.trim()) && !isNonLatin(t),
  );

  const cacheKey = `alt:kt:${expectedType}:${titleForms.slice(0, 3).join("|").toLowerCase()}`;
  return cached(cacheKey, () => findKitsuMediaUncached(seriesTitle, titleForms, expectedType));
}

async function findKitsuMediaUncached(
  seriesTitle: string,
  titleForms: string[],
  expectedType: "MANGA" | "MANHWA" | "UNKNOWN",
): Promise<{ id: string; attributes: KitsuMediaAttributes } | null> {

  // Kitsu labels each entry's publication type. A Korean manhwa catalog entry
  // must not adopt a Japanese manga of the same name (and vice versa) — that is
  // how ambiguous titles like "Happiness" get the wrong cast.
  const subtypeAllowed = (subtype: string | undefined): boolean => {
    const s = (subtype || "").toLowerCase();
    if (expectedType === "MANHWA") {
      return s === "manhwa" || s === "manhua";
    }
    if (expectedType === "MANGA") {
      return s === "manga" || s === "oneshot";
    }
    // Unknown type: accept any manga-family publication except novels.
    return s === "manga" || s === "manhwa" || s === "manhua" || s === "oneshot";
  };

  // Query the top title forms concurrently, then evaluate entries in form order
  // so the primary title keeps priority over romaji/synonym matches.
  const formsToQuery = titleForms.slice(0, 3);
  const responses = await Promise.all(
    formsToQuery.map((form) =>
      fetchJson(
        `${KITSU_API}/manga?filter[text]=${encodeURIComponent(form)}&page[limit]=5`,
        8000,
        KITSU_HEADERS,
      ) as Promise<{ data?: Array<{ id: string; attributes: KitsuMediaAttributes }> } | null>
    )
  );

  for (const json of responses) {
    for (const entry of json?.data ?? []) {
      const canonical = entry.attributes?.canonicalTitle || "";
      // Match against the primary title OR any known synonym (romaji title),
      // which is how "Goodnight Punpun" finds "Oyasumi Punpun" on Kitsu.
      if (!titleForms.some((form) => isStrongTitleMatch(form, canonical))) continue;
      if (!subtypeAllowed(entry.attributes?.subtype)) continue;

      // A title-only match on a single-word series is too weak; require that the
      // entry carries a chapter count or start date, i.e. it is a real record.
      const tTokens = normTitle(seriesTitle).split(" ").filter((t) => t.length > 2);
      if (tTokens.length <= 1) {
        const hasMetadata =
          (entry.attributes?.chapterCount ?? 0) > 0 || Boolean(entry.attributes?.startDate);
        if (!hasMetadata) continue;
      }

      return entry;
    }
  }

  return null;
}

/**
 * Fetch a media's character list from Kitsu (paginated 20 at a time).
 * Kitsu exposes a canonical name, alternate names, a short bio, and portraits.
 */
export async function fetchKitsuCharacters(
  kitsuMediaId: string,
  maxResults = 60,
): Promise<KitsuCharacter[]> {
  const cacheKey = `alt:kt-chars:${kitsuMediaId}:${maxResults}`;
  const hit = cacheGet<KitsuCharacter[]>(cacheKey);
  if (hit) return hit;

  const results: KitsuCharacter[] = [];
  let offset = 0;

  while (results.length < maxResults) {
    const json = (await fetchJson(
      `${KITSU_API}/manga/${kitsuMediaId}/characters?page[limit]=20&page[offset]=${offset}&include=character`,
      10000,
      KITSU_HEADERS,
    )) as {
      data?: Array<{ attributes?: { role?: string }; relationships?: { character?: { links?: { related?: string } } } }>;
      included?: Array<{
        attributes?: {
          canonicalName?: string;
          name?: string;
          description?: string;
          names?: string[];
          image?: { original?: string; large?: string; medium?: string };
        };
      }>;
      links?: { next?: string };
    } | null;

    if (!json) break;

    const included = json.included ?? [];
    if (included.length === 0) break;

    for (const item of included) {
      const a = item.attributes;
      if (!a) continue;
      const name = (a.canonicalName || a.name || "").trim();
      if (!name) continue;

      const rawNames = a.names;
      const aliases = (Array.isArray(rawNames) ? rawNames : [])
        .map((n) => (typeof n === "string" ? n.trim() : ""))
        .filter((n) => n && normTitle(n) !== normTitle(name));

      results.push({
        name,
        aliases,
        description: (a.description || "").trim(),
        imageUrl: a.image?.original || a.image?.large || a.image?.medium || "",
        role: "",
      });

      if (results.length >= maxResults) break;
    }

    if (!json.links?.next) break;
    offset += 20;
  }

  cacheSet(cacheKey, results, ALT_CACHE_TTL);
  return results;
}

/**
 * Fetch the full wiki-ready text for one Kitsu character (bio + attribution note).
 */
export function buildKitsuCharacterText(character: KitsuCharacter, seriesTitle: string): string {
  const parts = [
    `${character.name} is a character from ${seriesTitle}.`,
  ];
  if (character.aliases.length > 0) {
    parts.push(`Also known as: ${character.aliases.join(", ")}.`);
  }
  if (character.description) {
    parts.push(character.description);
  }
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Unified fallback resolver
// ---------------------------------------------------------------------------

export type AltSourceName = "wikipedia" | "kitsu";

export interface AltCharacterSource {
  /** Where the text came from. */
  source: AltSourceName;
  /** Human-readable attribution string for the About page / logs. */
  attribution: string;
  /** Title of the source page (article or media entry). */
  pageTitle: string;
  /** Plain text handed to the AI extractor. */
  text: string;
}

/**
 * Resolve a single character's lore text from a non-Fandom source.
 *
 * Strategy: prefer Wikipedia (richer prose, section-isolatable per character),
 * then Kitsu (structured bios, good manhwa coverage). Returns null when neither
 * source has anything substantial, so the caller can fall back to pure AI
 * synthesis.
 */
export async function fetchAltCharacterText(
  seriesTitle: string,
  characterName: string,
  synonyms: string[] = [],
  expectedType: "MANGA" | "MANHWA" | "UNKNOWN" = "UNKNOWN",
): Promise<AltCharacterSource | null> {
  // 1. Wikipedia — isolate the character's own section.
  try {
    const page = await findWikipediaCharacterPage(seriesTitle, synonyms);
    if (page) {
      const section = extractWikipediaCharacterSection(page.wikitext, characterName);
      if (section && section.text.length >= 200) {
        return {
          source: "wikipedia",
          attribution: `Wikipedia, "${page.pageTitle}" (CC BY-SA 4.0)`,
          pageTitle: page.pageTitle,
          text: section.text,
        };
      }
    }
  } catch {
    // Fall through to Kitsu.
  }

  // 2. Kitsu — structured per-character bio.
  try {
    const media = await findKitsuMedia(seriesTitle, synonyms, expectedType);
    if (media) {
      const chars = await fetchKitsuCharacters(media.id, 60);
      const target = normTitle(characterName);
      const match = chars.find((c) => {
        if (normTitle(c.name) === target) return true;
        return c.aliases.some((a) => normTitle(a) === target);
      });
      if (match && match.description.length >= 120) {
        return {
          source: "kitsu",
          attribution: `Kitsu, "${media.attributes?.canonicalTitle ?? seriesTitle}" character database`,
          pageTitle: match.name,
          text: buildKitsuCharacterText(match, seriesTitle),
        };
      }
    }
  } catch {
    // Nothing else to try.
  }

  return null;
}

/**
 * List the characters a fallback source knows about for a series, so the catalog
 * can be populated even when no Fandom wiki exists.
 */
export async function fetchAltCharacterRoster(
  seriesTitle: string,
  synonyms: string[] = [],
  expectedType: "MANGA" | "MANHWA" | "UNKNOWN" = "UNKNOWN",
  maxResults = 60,
): Promise<Array<{ name: string; aliases: string[]; imageUrl: string; source: AltSourceName }>> {
  const roster: Array<{ name: string; aliases: string[]; imageUrl: string; source: AltSourceName }> = [];
  const seen = new Set<string>();

  const push = (
    name: string,
    aliases: string[],
    imageUrl: string,
    source: AltSourceName,
  ) => {
    const key = normTitle(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    roster.push({ name, aliases, imageUrl, source });
  };

  // Wikipedia list articles give names but no portraits.
  try {
    const page = await findWikipediaCharacterPage(seriesTitle, synonyms);
    if (page) {
      for (const name of extractWikipediaCharacterNames(page.wikitext)) {
        push(name, [], "", "wikipedia");
        if (roster.length >= maxResults) return roster;
      }
    }
  } catch {
    // Continue to Kitsu.
  }

  // Kitsu adds portraits and alternate names.
  try {
    const media = await findKitsuMedia(seriesTitle, synonyms, expectedType);
    if (media) {
      const chars = await fetchKitsuCharacters(media.id, maxResults);
      for (const c of chars) {
        push(c.name, c.aliases, c.imageUrl, "kitsu");
        if (roster.length >= maxResults) break;
      }
    }
  } catch {
    // Return whatever we have.
  }

  return roster;
}
