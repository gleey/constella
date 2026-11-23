/**
 * Relation categorisation for graph colouring & legends.
 *
 * relationType is free text produced by the wiki parser, the LLM lore pass and
 * the admin UI ("Father / Son", "Sworn Brother", "Nemesis", …). The graph needs
 * a small stable set of buckets so a reader can tell family from foe at a
 * glance without reading every edge label.
 */

export type RelationCategory = "family" | "friend" | "enemy" | "other";

export const RELATION_CATEGORIES: {
  id: RelationCategory;
  label: string;
  color: string;
}[] = [
  { id: "family", label: "Family", color: "#f472b6" },
  { id: "friend", label: "Friend / Ally", color: "#34d399" },
  { id: "enemy", label: "Enemy / Rival", color: "#f87171" },
  { id: "other", label: "Other", color: "#818cf8" },
];

const FAMILY =
  /\b(father|mother|parent|son|daughter|child|brother|sister|sibling|husband|wife|spouse|family|cousin|uncle|aunt|nephew|niece|grandfather|grandmother|grandpa|grandma|adoptive|adopted|step-?(father|mother|brother|sister|son|daughter|child)|in-?law|twin|kin|ancestor|descendant)\b/i;

const ENEMY =
  /\b(enemy|enemies|rival|rivalry|nemesis|foe|opponent|antagonist|villain|adversary|hostile|hatred|hate|killer|murderer|assassin|target|bully|tormentor|captor|kidnapper)\b/i;

const FRIEND =
  /\b(friend|friends|friendship|ally|allies|alliance|partner|partners|companion|comrade|teammate|team|colleague|guild|crew|subordinate|superior|master|disciple|mentor|student|pupil|teacher|apprentice|contractor|contract|sidekick|boss|employer|employee|servant|butler|maid|guard|protector|ward|benefactor|sponsor|sworn)\b/i;

/** Bucket a free-text relation type. Family wins over friend ("Sworn Brother"). */
export function relationCategory(relationType: string | null | undefined): RelationCategory {
  const t = (relationType || "").trim();
  if (!t) return "other";
  if (FAMILY.test(t)) return "family";
  if (ENEMY.test(t)) return "enemy";
  if (FRIEND.test(t)) return "friend";
  return "other";
}

export function relationCategoryColor(relationType: string | null | undefined): string {
  const id = relationCategory(relationType);
  return RELATION_CATEGORIES.find((c) => c.id === id)!.color;
}
