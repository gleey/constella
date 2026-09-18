/**
 * Name Resolution (PRD 4.C step 4).
 * Maps targetName/factionName strings to existing Character/Faction records.
 *
 * Rules:
 * - Case-insensitive match against Character.name, then Character.aliases
 * - Scoped to same mediaId
 * - If no match: add to unresolvedNames, set draft status UNRESOLVED
 * - Never auto-create characters
 */

import type { Character, Faction } from "@/generated/prisma/client";

/**
 * Helper to normalize name tokens (removes hyphens, spaces, accents).
 * e.g. "Dok-Ja Kim" -> "dokjakim", "Kim Dokja" -> "dokjakim"
 */
function canonicalize(str: string): string {
  return str.toLowerCase().replace(/[\s\-_'.]/g, "");
}

function wordTokens(str: string): Set<string> {
  // Remove hyphens, apostrophes without adding spaces to join hyphenated names
  // e.g. "Joong-Hyuk Yoo" -> "joonghyuk yoo" -> ["joonghyuk", "yoo"]
  const unhyphenated = str.toLowerCase().replace(/[\-']/g, "");
  const tokens = unhyphenated.split(/\s+/).filter(Boolean);
  return new Set(tokens);
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Resolve a target name to a character ID.
 * Returns characterId if found, null otherwise.
 */
export function resolveCharacterName(
  targetName: string,
  characters: Pick<Character, "id" | "name" | "aliases">[],
): string | null {
  const needle = targetName.toLowerCase().trim();
  const canonNeedle = canonicalize(needle);
  const needleWords = wordTokens(needle);

  // 1. Try exact name match first
  for (const c of characters) {
    if (c.name.toLowerCase() === needle) return c.id;
  }

  // 2. Try aliases exact match
  for (const c of characters) {
    for (const alias of c.aliases) {
      if (alias.toLowerCase() === needle) return c.id;
    }
  }

  // 3. Canonicalized match (handles "Dok-Ja Kim" vs "Dokja Kim" vs "DokjaKim")
  for (const c of characters) {
    if (canonicalize(c.name) === canonNeedle) return c.id;
    for (const alias of c.aliases) {
      if (canonicalize(alias) === canonNeedle) return c.id;
    }
  }

  // 4. Token set equality (handles "Kim Dokja" vs "Dokja Kim")
  for (const c of characters) {
    const nameWords = wordTokens(c.name);
    if (needleWords.size > 1 && nameWords.size === needleWords.size) {
      let allMatch = true;
      for (const w of needleWords) {
        if (!nameWords.has(w)) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) return c.id;
    }

    // Check alias words
    for (const alias of c.aliases) {
      const aliasWords = wordTokens(alias);
      if (needleWords.size > 1 && aliasWords.size === needleWords.size) {
        let allMatch = true;
        for (const w of needleWords) {
          if (!aliasWords.has(w)) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) return c.id;
      }
    }
  }

  // 5. Substring / significant token containment
  // e.g. "Yoo Joonghyuk" matches "Joong-Hyuk Yoo" or target "Jinwoo" matches "Sung Jinwoo"
  for (const c of characters) {
    const cCanon = canonicalize(c.name);
    if (cCanon.includes(canonNeedle) || canonNeedle.includes(cCanon)) {
      // Must be significant length (>= 4 chars) to avoid false positives on short tokens
      if (canonNeedle.length >= 4 && cCanon.length >= 4) {
        return c.id;
      }
    }
    for (const alias of c.aliases) {
      const aCanon = canonicalize(alias);
      if (aCanon.includes(canonNeedle) || canonNeedle.includes(aCanon)) {
        if (canonNeedle.length >= 4 && aCanon.length >= 4) {
          return c.id;
        }
      }
    }
  }

  // 6. Fuzzy Levenshtein & token-level fuzzy match
  for (const c of characters) {
    const cCanon = canonicalize(c.name);
    if (Math.abs(cCanon.length - canonNeedle.length) <= 3) {
      if (levenshteinDistance(cCanon, canonNeedle) <= 2) {
        return c.id;
      }
    }
    for (const alias of c.aliases) {
      const aCanon = canonicalize(alias);
      if (Math.abs(aCanon.length - canonNeedle.length) <= 3) {
        if (levenshteinDistance(aCanon, canonNeedle) <= 2) {
          return c.id;
        }
      }
    }

    // Token-level fuzzy (handles "Camus Morg" vs "Camyu Morgue", "Yenika" vs "Yennekar")
    const checkTokenFuzzy = (targetWords: Set<string>, candWords: Set<string>) => {
      if (targetWords.size === 0 || candWords.size === 0) return false;
      const cArr = Array.from(candWords);
      let matchedTokens = 0;
      for (const tw of targetWords) {
        const hasMatch = cArr.some((cw) => {
          if (cw === tw) return true;
          const maxDist = Math.max(tw.length, cw.length) >= 6 ? 3 : 2;
          return levenshteinDistance(tw, cw) <= maxDist;
        });
        if (hasMatch) matchedTokens++;
      }
      return matchedTokens >= Math.min(targetWords.size, 2);
    };

    if (checkTokenFuzzy(needleWords, wordTokens(c.name))) {
      return c.id;
    }
    for (const alias of c.aliases) {
      if (checkTokenFuzzy(needleWords, wordTokens(alias))) {
        return c.id;
      }
    }
  }

  return null;
}

/**
 * Resolve a faction name to a faction ID.
 * Returns factionId if found, null otherwise.
 */
export function resolveFactionName(
  factionName: string,
  factions: Pick<Faction, "id" | "name">[],
): string | null {
  const needle = factionName.toLowerCase().trim();
  const canonNeedle = canonicalize(needle);

  // 1. Exact match
  for (const f of factions) {
    if (f.name.toLowerCase() === needle) return f.id;
  }

  // 2. Canonicalized match
  for (const f of factions) {
    if (canonicalize(f.name) === canonNeedle) return f.id;
  }

  // 3. Containment
  for (const f of factions) {
    const fCanon = canonicalize(f.name);
    if (fCanon.includes(canonNeedle) || canonNeedle.includes(fCanon)) {
      if (canonNeedle.length >= 4 && fCanon.length >= 4) {
        return f.id;
      }
    }
  }

  return null;
}

/**
 * Run name resolution on a parsed Gemini output.
 * Returns { resolvedRelationships, resolvedFactions, unresolvedNames }.
 */
export function resolveNames(
  parsed: {
    relationships: { targetName: string; relationType: string; validFrom: number; validUntil: number | null; isSensitive: boolean }[];
    factions: { factionName: string; validFrom: number; validUntil: number | null; isSensitive: boolean }[];
  },
  characters: Pick<Character, "id" | "name" | "aliases">[],
  factions: Pick<Faction, "id" | "name">[],
) {
  const unresolvedNames: string[] = [];

  const resolvedRelationships = parsed.relationships.map((r) => {
    const targetId = resolveCharacterName(r.targetName, characters);
    if (!targetId) unresolvedNames.push(r.targetName);
    return { ...r, targetCharacterId: targetId };
  });

  const resolvedFactions = parsed.factions.map((f) => {
    const factionId = resolveFactionName(f.factionName, factions);
    if (!factionId) unresolvedNames.push(f.factionName);
    return { ...f, factionId };
  });

  return {
    resolvedRelationships,
    resolvedFactions,
    unresolvedNames: [...new Set(unresolvedNames)], // dedupe
  };
}
