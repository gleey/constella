import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateTemporalBounds, TemporalValidationError } from "@/lib/temporal";

/**
 * GET /api/admin/relationships?mediaId=xxx
 * List all active relationships for a media, with source and target character names.
 */
export async function GET(req: NextRequest) {
  const mediaId = req.nextUrl.searchParams.get("mediaId");
  if (!mediaId) {
    return NextResponse.json({ error: "mediaId is required" }, { status: 400 });
  }

  const list = await prisma.relationship.findMany({
    where: { mediaId },
    include: {
      sourceCharacter: { select: { id: true, name: true, imageUrl: true } },
      targetCharacter: { select: { id: true, name: true, imageUrl: true } },
    },
    orderBy: [{ validFrom: "asc" }, { id: "asc" }],
  });

  return NextResponse.json(list);
}

/**
 * POST /api/admin/relationships
 * Create a new relationship directly in the active table.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mediaId, sourceCharacterId, targetCharacterId, relationType, validFrom, validUntil, isSensitive } = body;

    if (!mediaId || !sourceCharacterId || !targetCharacterId || !relationType) {
      return NextResponse.json(
        { error: "Missing required fields: mediaId, sourceCharacterId, targetCharacterId, relationType" },
        { status: 400 },
      );
    }

    const from = parseInt(validFrom, 10);
    const until = validUntil !== null && validUntil !== undefined && validUntil !== "" ? parseInt(validUntil, 10) : null;

    try {
      validateTemporalBounds(from, until);
    } catch (err) {
      if (err instanceof TemporalValidationError) {
        return NextResponse.json({ error: err.message }, { status: 422 });
      }
      throw err;
    }

    const created = await prisma.relationship.create({
      data: {
        mediaId,
        sourceCharacterId,
        targetCharacterId,
        relationType,
        validFrom: from,
        validUntil: until,
        isSensitive: !!isSensitive,
      },
      include: {
        sourceCharacter: { select: { id: true, name: true, imageUrl: true } },
        targetCharacter: { select: { id: true, name: true, imageUrl: true } },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
