/**
 * Unit checks for series links and cross-series character reuse.
 * Run: npx tsx tests/media-relations.test.ts
 */
import assert from "node:assert/strict";
import { normalizeRelations, earliestRelatedDebut } from "../src/lib/media-relations";

// ── normalizeRelations ─────────────────────────────────────────────────
assert.deepEqual(normalizeRelations(null), []);
assert.deepEqual(normalizeRelations([{ title: "X" }]), []);
assert.deepEqual(normalizeRelations([{ anilistId: 1, title: "X", relationType: "ADAPTATION" }]), []);
assert.deepEqual(
  normalizeRelations([
    { anilistId: 1, title: "X", coverImage: "", relationType: "SEQUEL" },
    { anilistId: 1, title: "X", coverImage: "", relationType: "SEQUEL" }, // dupe
    { anilistId: 2, title: "Y", relationType: "PREQUEL" },
  ]),
  [
    { anilistId: 1, title: "X", coverImage: "", relationType: "SEQUEL" },
    { anilistId: 2, title: "Y", coverImage: "", relationType: "PREQUEL" },
  ],
);

// ── earliestRelatedDebut ───────────────────────────────────────────────
const related = [
  { name: "Kenji Endou", aliases: [], introducedAtChapter: 1, debutKnown: true },
  { name: "Keitarou Fukuda", aliases: [], introducedAtChapter: 10, debutKnown: true },
  { name: "Yamane", aliases: [], introducedAtChapter: 11, debutKnown: false },
];

// Same name → earliest chapter wins.
assert.deepEqual(
  earliestRelatedDebut({ name: "Keitarou Fukuda", aliases: [] }, related),
  { chapter: 10, known: true },
);

// Alias on either side is enough.
assert.deepEqual(
  earliestRelatedDebut({ name: "Endou", aliases: ["Kenji Endou"] }, related),
  { chapter: 1, known: true },
);
assert.deepEqual(
  earliestRelatedDebut({ name: "Kenji Endou", aliases: [] }, [
    { name: "Endou", aliases: ["Kenji Endou"], introducedAtChapter: 3, debutKnown: true },
  ]),
  { chapter: 3, known: true },
);

// Token order ("Kim Dokja" vs "Dok-Ja Kim") merges.
assert.deepEqual(
  earliestRelatedDebut({ name: "Dok-Ja Kim", aliases: [] }, [
    { name: "Kim Dokja", aliases: [], introducedAtChapter: 7, debutKnown: true },
  ]),
  { chapter: 7, known: true },
);

// No match → null (no invented merge).
assert.equal(earliestRelatedDebut({ name: "Suzan", aliases: [] }, related), null);
assert.equal(earliestRelatedDebut({ name: "Eun-Yu", aliases: [] }, [
  { name: "Eun-Hyuk", aliases: [], introducedAtChapter: 2, debutKnown: true },
]), null);

// Multiple matches take the earliest, and a verified debut anywhere makes it known.
assert.deepEqual(
  earliestRelatedDebut({ name: "Yamane", aliases: [] }, [
    { name: "Yamane", aliases: [], introducedAtChapter: 40, debutKnown: true },
    { name: "Yamane", aliases: [], introducedAtChapter: 11, debutKnown: false },
  ]),
  { chapter: 11, known: true },
);

console.log("media-relations: all checks passed");
