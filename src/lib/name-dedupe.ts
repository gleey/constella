/**
 * Conservative character dedup predicate (shared by Tier-1 catalog sync
 * and one-off repair scripts).
 *
 * Merge ONLY when names are provably the same person:
 *  (a) canonical-equal — same letters ignoring case/space/hyphen/apostrophe
 *      e.g. "Hades " vs "Hades", "Yu-Ra" vs "Yura", "Vikir van" vs "Vikir Van"
 *  (b) token-reorder — identical token multisets, different order
 *      e.g. "Kim Dokja" vs "Dok-Ja Kim", "Song Chi-Yul" vs "Chi-Yul Song"
 *  (c) curated-pair — manually verified transliteration variants
 *      e.g. "Twenty-Fifth Bam" vs "Twenty-Fifth Baam"
 *
 * Deliberately NOT included: fuzzy/Levenshtein matching. One-letter
 * differences in given names ("Su-Han" vs "Su-Man", "Eun-Hyuk" vs "Eun-Yu",
 * "Sonyeo" vs "Sonyeon") usually mean DIFFERENT people (siblings, etc).
 */

export function normalizeName(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function canonicalizeName(s: string): string {
  return s.toLowerCase().replace(/[\s\-_'.]/g, "");
}

function wordTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[\-']/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

// Manually verified same-person transliteration variants (canonical form).
const CURATED_PAIRS: Array<[string, string]> = [
  ["mino", "minohan"], // The World After the Fall
  ["ohkangwoo", "kanguo"], // After Ten Millennia in Hell
  ["jinuseong", "sungjinwoo"], // Solo Leveling
  ["juhuilee", "leejoohee"], // Solo Leveling
  ["dongsuhwang", "hwangdongsoo"], // Solo Leveling
  ["jinhoyu", "yoojinho"], // Solo Leveling
  ["yunhobaek", "baekyoonho"], // Solo Leveling
  ["jincheolu", "woojinchul"], // Solo Leveling
  ["jinaseong", "sungjinah"], // Solo Leveling
  ["geonhuigo", "gogunhee"], // Solo Leveling
  ["byeonggumin", "minbyunggu"], // Solo Leveling
  ["junghyeokyu", "yoojoonghyuk"], // Omniscient Reader
  ["suyeonghan", "hansooyoung"], // Omniscient Reader
  ["twentyfifthbam", "twentyfifthbaam"], // Tower of God
  ["khunagueroagnes", "agueroagniskhun"], // Tower of God
  ["lortellekeheln", "lortellekecheln"], // The Extra's Academy Survival Guide
  ["edrothstaylor", "edrothtaylor"], // The Extra's Academy Survival Guide
  ["teresadelaurentis", "teresadulaurentia"], // I'm the Max-Level Newbie
  ["kangjinhyuk", "jinhyeokkang"], // I'm the Max-Level Newbie
];

export type MergeReason = "canon-equal" | "token-reorder" | "curated-pair";

/** Returns merge reason if aName and bName are provably the same person, else null. */
export function shouldMergeCharacters(aName: string, bName: string): MergeReason | null {
  const ca = canonicalizeName(aName);
  const cb = canonicalizeName(bName);
  if (!ca || !cb) return null;
  if (ca === cb) return "canon-equal";

  const ta = wordTokens(aName);
  const tb = wordTokens(bName);
  if (ta.length >= 2 && ta.length === tb.length) {
    const setA = new Set(ta);
    if (tb.every((t) => setA.has(t))) return "token-reorder";
  }

  for (const [x, y] of CURATED_PAIRS) {
    if ((ca === x && cb === y) || (ca === y && cb === x)) return "curated-pair";
  }
  return null;
}
