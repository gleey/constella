/**
 * Temporal validation & query helpers (PRD Bagian 3.A + 4.A).
 *
 * Constraints enforced in application layer on Approve:
 *  - validFrom >= 1
 *  - if validUntil is not null: validUntil > validFrom  (exclusive upper bound)
 *
 * Layer 1 filter (backend-only, zero-spoiler):
 *  validFrom <= N AND (validUntil > N OR validUntil IS NULL)
 *
 * Deterministic tie-break: ORDER BY validFrom DESC, createdAt DESC, id DESC → take first.
 */

// ── Validation ──────────────────────────────────────────────────────────

export class TemporalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemporalValidationError";
  }
}

/**
 * Validate temporal bounds before persisting.
 * Throws TemporalValidationError on constraint violation.
 */
export function validateTemporalBounds(
  validFrom: number,
  validUntil: number | null,
): void {
  if (!Number.isInteger(validFrom) || validFrom < 1) {
    throw new TemporalValidationError(
      `validFrom must be an integer >= 1, got ${validFrom}`,
    );
  }

  if (validUntil !== null) {
    if (!Number.isInteger(validUntil)) {
      throw new TemporalValidationError(
        `validUntil must be an integer or null, got ${validUntil}`,
      );
    }
    if (validUntil <= validFrom) {
      throw new TemporalValidationError(
        `validUntil (${validUntil}) must be > validFrom (${validFrom}) (exclusive upper bound)`,
      );
    }
  }
}

// ── Query filter (Layer 1) ──────────────────────────────────────────────

/**
 * Prisma `where` clause fragment for the temporal Layer 1 filter.
 * Returns rows active at chapter N.
 *
 * Usage: `prisma.characterStatus.findMany({ where: { characterId, ...temporalFilter(N) } })`
 */
export function temporalFilter(chapter: number) {
  return {
    validFrom: { lte: chapter },
    OR: [{ validUntil: { gt: chapter } }, { validUntil: null }],
  };
}

/**
 * Deterministic ordering per PRD 4.A:
 * most-recent validFrom first, then createdAt DESC, then id DESC.
 */
export const temporalOrderBy = [
  { validFrom: "desc" as const },
  { createdAt: "desc" as const },
  { id: "desc" as const },
];

/**
 * Filter a character by introducedAtChapter.
 * Character is visible only if introducedAtChapter <= N.
 */
export function characterVisibleAt(chapter: number) {
  return { introducedAtChapter: { lte: chapter } };
}

/**
 * Filter a faction by introducedAtChapter.
 * Faction is visible only if introducedAtChapter <= N.
 */
export function factionVisibleAt(chapter: number) {
  return { introducedAtChapter: { lte: chapter } };
}
