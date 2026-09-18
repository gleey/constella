import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateTemporalBounds, TemporalValidationError } from "@/lib/temporal";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/relationships/[id]
 * Update an existing relationship (relationType, validFrom, validUntil, isSensitive).
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const { relationType, validFrom, validUntil, isSensitive } = body;

    const existing = await prisma.relationship.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Relationship not found" }, { status: 404 });
    }

    const from = validFrom !== undefined ? parseInt(validFrom, 10) : existing.validFrom;
    const until =
      validUntil !== undefined
        ? validUntil !== null && validUntil !== ""
          ? parseInt(validUntil, 10)
          : null
        : existing.validUntil;

    try {
      validateTemporalBounds(from, until);
    } catch (err) {
      if (err instanceof TemporalValidationError) {
        return NextResponse.json({ error: err.message }, { status: 422 });
      }
      throw err;
    }

    const updated = await prisma.relationship.update({
      where: { id },
      data: {
        relationType: relationType ?? existing.relationType,
        validFrom: from,
        validUntil: until,
        isSensitive: isSensitive !== undefined ? !!isSensitive : existing.isSensitive,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/relationships/[id]
 * Delete a relationship.
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    await prisma.relationship.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
