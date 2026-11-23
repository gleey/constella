/**
 * Unit checks for relation categorisation (no DB needed).
 * Run: npx tsx tests/relations.test.ts
 */
import assert from "node:assert/strict";
import { relationCategory, relationCategoryColor, RELATION_CATEGORIES } from "../src/lib/relations";

const cases: [string, string][] = [
  ["Father / Son", "family"],
  ["Mother / Daughter", "family"],
  ["Brother / Sister", "family"],
  ["Husband / Wife", "family"],
  ["Adoptive Father", "family"],
  ["Stepmother", "family"],
  ["Twin Brother", "family"],
  ["Enemy", "enemy"],
  ["Rival", "enemy"],
  ["Nemesis", "enemy"],
  ["Archenemy", "other"], // word-boundary: not a listed token
  ["Friend", "friend"],
  ["Allies", "friend"],
  ["Partner", "friend"],
  ["Master / Disciple", "friend"],
  ["Guild Member", "friend"],
  ["Sworn Brother", "family"], // family wins over friend
  ["Love Interest", "other"],
  ["Stranger", "other"],
  ["Ally", "friend"],
  ["", "other"],
];

let failures = 0;
for (const [input, expected] of cases) {
  try {
    assert.equal(relationCategory(input), expected, `relationCategory(${JSON.stringify(input)})`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${JSON.stringify(input)} → expected ${expected}:`, (err as Error).message);
  }
}

// null/undefined must not throw
assert.equal(relationCategory(null), "other");
assert.equal(relationCategory(undefined), "other");

// every category has a distinct colour and a label
assert.equal(new Set(RELATION_CATEGORIES.map((c) => c.color)).size, RELATION_CATEGORIES.length);
for (const c of RELATION_CATEGORIES) {
  assert.match(c.color, /^#[0-9a-f]{6}$/i);
  assert.ok(c.label.length > 0);
  assert.equal(relationCategoryColor(c.id === "other" ? "Whatever" : c.label), c.color);
}

console.log(`relations: ${cases.length + 2 + RELATION_CATEGORIES.length * 3} checks, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
