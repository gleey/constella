/**
 * Unit checks for deterministic Fandom infobox relation parsing (no LLM).
 * Run: npx tsx tests/wiki-relations.test.ts
 */
import assert from "node:assert/strict";
import { parseInfoboxRelations } from "../src/lib/fandom";

const sample = `{{Infobox character
| name = Shuri
| relatives = [[Jeremy Nürnberger]] <small>(brother)</small><br>[[Norra]] <small>(sister)</small>
| spouse = [[Ezra]]
| friends = [[Lina]]
| enemies = [[Kaiser]]
| debut = Chapter 12
| affiliation = [[House Nürnberger]]
}}
== Relationships ==
Shuri is close to [[Someone]] and hates [[Other]].
`;

const rels = parseInfoboxRelations(sample);
const find = (t: string) => rels.filter((r) => r.targetName === t);

assert.deepEqual(
  rels.map((r) => `${r.targetName}:${r.relationType}`).sort(),
  [
    "Ezra:Spouse",
    "Jeremy Nürnberger:Brother",
    "Kaiser:Enemy",
    "Lina:Friend",
    "Norra:Sister",
  ].sort(),
);

// Field default used when no descriptor is present.
assert.deepEqual(parseInfoboxRelations("| relatives = [[A]]\n"), [{ targetName: "A", relationType: "Relative" }]);

// Piped links resolve to the display title.
assert.deepEqual(parseInfoboxRelations("| friends = [[A|B]]\n"), [{ targetName: "B", relationType: "Friend" }]);

// Plain prose without wikilinks is ignored.
assert.deepEqual(parseInfoboxRelations("| friends = Some unnamed guy\n"), []);

// Non-relation infobox fields are ignored (affiliation is a group, not a person).
assert.deepEqual(parseInfoboxRelations("| debut = Chapter 3\n| age = 20\n| affiliation = [[House X]]\n"), []);

// Duplicate targets with the same type collapse; different types both kept.
{
  const dupes = parseInfoboxRelations("| friends = [[A]]\n| allies = [[A]]\n");
  assert.equal(dupes.length, 2);
}

// Case-insensitive field names and spacing variants.
assert.deepEqual(parseInfoboxRelations("| Relatives = [[A]]\n"), [{ targetName: "A", relationType: "Relative" }]);
assert.deepEqual(parseInfoboxRelations("|relatives=[[A]]\n"), [{ targetName: "A", relationType: "Relative" }]);

console.log(`wiki-relations: ${rels.length} relations parsed, all checks passed`);
