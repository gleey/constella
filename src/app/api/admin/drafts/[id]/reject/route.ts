/**
 * POST /api/admin/drafts/[id]/reject — reject a draft.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const draft = await prisma.draftIngestion.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  if (draft.reviewedAt) {
    return NextResponse.json({ error: "Draft already reviewed" }, { status: 409 });
  }

  const updated = await prisma.draftIngestion.update({
    where: { id },
    data: { status: "REJECTED", reviewedAt: new Date() },
  });

  return NextResponse.json(updated);
}
