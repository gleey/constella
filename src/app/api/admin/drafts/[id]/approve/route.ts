/**
 * POST /api/admin/drafts/[id]/approve
 *
 * PRD 4.C step 5: Approve draft → move data to active tables.
 * Guards:
 * - Reject if draft.reviewedAt already set (idempotency)
 * - Reject if unresolvedNames not empty
 * - Validate all temporal bounds before writing
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateTemporalBounds, TemporalValidationError } from "@/lib/temporal";
import { resolveCharacterName, resolveFactionName } from "@/lib/name-resolution";
import type { GeminiParsedCharacter } from "@/lib/gemini";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  const draft = await prisma.draftIngestion.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  // Idempotency guard
  if (draft.reviewedAt) {
    return NextResponse.json(
      { error: "Draft already approved. Reject to prevent duplicate rows." },
      { status: 409 },
    );
  }

  // Block if unresolved names remain
  if (draft.unresolvedNames.length > 0) {
    return NextResponse.json(
      { error: "Cannot approve: unresolved names remain", unresolvedNames: draft.unresolvedNames },
      { status: 422 },
    );
  }

  if (draft.status === "REJECTED") {
    return NextResponse.json({ error: "Draft is rejected" }, { status: 409 });
  }

  const parsed = draft.parsedJson as unknown as GeminiParsedCharacter;

  // Find the character this draft belongs to
  const character = await prisma.character.findFirst({
    where: { mediaId: draft.mediaId, name: draft.characterName },
  });
  if (!character) {
    return NextResponse.json(
      { error: `Character "${draft.characterName}" not found in media` },
      { status: 404 },
    );
  }

  // Load all characters and factions for name resolution
  const allCharacters = await prisma.character.findMany({
    where: { mediaId: draft.mediaId },
    select: { id: true, name: true, aliases: true },
  });
  const allFactions = await prisma.faction.findMany({
    where: { mediaId: draft.mediaId },
    select: { id: true, name: true },
  });

  // Validate all temporal bounds first
  try {
    for (const d of parsed.descriptions) {
      validateTemporalBounds(d.validFrom, d.validUntil);
    }
    for (const s of parsed.statuses) {
      validateTemporalBounds(s.validFrom, s.validUntil);
    }
    for (const r of parsed.relationships) {
      validateTemporalBounds(r.validFrom, r.validUntil);
    }
    for (const f of parsed.factions) {
      validateTemporalBounds(f.validFrom, f.validUntil);
    }
  } catch (err) {
    if (err instanceof TemporalValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }

  // Update character's introducedAtChapter
  await prisma.character.update({
    where: { id: character.id },
    data: { introducedAtChapter: parsed.introducedAtChapter },
  });

  // Write descriptions
  if (parsed.descriptions.length > 0) {
    await prisma.characterDescription.createMany({
      data: parsed.descriptions.map((d) => ({
        characterId: character.id,
        text: d.text,
        validFrom: d.validFrom,
        validUntil: d.validUntil,
        isSensitive: d.isSensitive,
      })),
    });
  }

  // Write statuses
  if (parsed.statuses.length > 0) {
    await prisma.characterStatus.createMany({
      data: parsed.statuses.map((s) => ({
        characterId: character.id,
        status: s.status,
        validFrom: s.validFrom,
        validUntil: s.validUntil,
        isSensitive: s.isSensitive,
      })),
    });
  }

  // Write relationships (resolve names again to get IDs)
  for (const r of parsed.relationships) {
    const targetId = resolveCharacterName(r.targetName, allCharacters);
    if (!targetId) continue; // should not happen — names were resolved already

    await prisma.relationship.create({
      data: {
        mediaId: draft.mediaId,
        sourceCharacterId: character.id,
        targetCharacterId: targetId,
        relationType: r.relationType,
        validFrom: r.validFrom,
        validUntil: r.validUntil,
        isSensitive: r.isSensitive,
      },
    });
  }

  // Write faction memberships (upsert factions if needed)
  for (const f of parsed.factions) {
    let factionId = resolveFactionName(f.factionName, allFactions);

    if (!factionId) {
      // Create faction — this happens when Gemini finds factions not yet in DB
      const newFaction = await prisma.faction.create({
        data: {
          mediaId: draft.mediaId,
          name: f.factionName,
          introducedAtChapter: f.validFrom,
        },
      });
      factionId = newFaction.id;
    }

    await prisma.factionMembership.create({
      data: {
        factionId,
        characterId: character.id,
        validFrom: f.validFrom,
        validUntil: f.validUntil,
        isSensitive: f.isSensitive,
      },
    });
  }

  // Mark draft as approved
  await prisma.draftIngestion.update({
    where: { id },
    data: {
      status: "APPROVED",
      reviewedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true, characterId: character.id });
}
