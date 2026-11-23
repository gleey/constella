/**
 * Series links (AniList PREQUEL/SEQUEL).
 *
 * Stored as a JSON array on Media so a link exists even before the related
 * series has been ingested — the UI then falls back to "not in catalog".
 */

import { prisma } from "./prisma";
import type { MediaRelation } from "./anilist";
import { shouldMergeCharacters } from "./name-dedupe";

/** Coerce a stored JSON value into a clean MediaRelation[]. */
export function normalizeRelations(raw: unknown): MediaRelation[] {
  if (!Array.isArray(raw)) return [];
  const out: MediaRelation[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Partial<MediaRelation>;
    if (r.relationType !== "PREQUEL" && r.relationType !== "SEQUEL") continue;
    if (typeof r.anilistId !== "number" || !r.title) continue;
    const key = `${r.anilistId}|${r.relationType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      anilistId: r.anilistId,
      title: String(r.title),
      coverImage: r.coverImage || "",
      relationType: r.relationType,
    });
  }
  return out;
}

export async function saveMediaRelations(
  mediaId: string,
  relations: MediaRelation[],
): Promise<void> {
  await prisma.media.update({
    where: { id: mediaId },
    data: { relations: normalizeRelations(relations) as object[] },
  });
}

/** anilistId → local media id, for relations whose series is already ingested. */
export async function relatedMediaIds(
  relations: MediaRelation[],
): Promise<Map<number, string>> {
  if (relations.length === 0) return new Map();
  const rows = await prisma.media.findMany({
    where: { anilistId: { in: relations.map((r) => r.anilistId) } },
    select: { id: true, anilistId: true },
  });
  return new Map(rows.map((r) => [r.anilistId, r.id]));
}

/**
 * Earliest debut of the same character in a linked series, or null when the
 * character does not appear there. Matching is conservative (canonical-equal,
 * token-reorder, curated transliteration pair) so two different people with
 * similar names are never merged.
 */
export function earliestRelatedDebut<
  T extends { name: string; aliases: string[]; introducedAtChapter: number; debutKnown: boolean },
>(character: { name: string; aliases: string[] }, related: T[]): { chapter: number; known: boolean } | null {
  let best: { chapter: number; known: boolean } | null = null;
  for (const rc of related) {
    const match =
      shouldMergeCharacters(character.name, rc.name) ||
      character.aliases.some((a) => shouldMergeCharacters(a, rc.name)) ||
      rc.aliases.some((a) => shouldMergeCharacters(character.name, a));
    if (!match) continue;
    if (!best) {
      best = { chapter: rc.introducedAtChapter, known: rc.debutKnown };
      continue;
    }
    if (rc.introducedAtChapter < best.chapter) best.chapter = rc.introducedAtChapter;
    // One verified debut anywhere in the linked series is enough.
    if (rc.debutKnown) best.known = true;
  }
  return best;
}
