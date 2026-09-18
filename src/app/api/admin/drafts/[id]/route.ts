/**
 * GET  /api/admin/drafts/[id] — single draft detail
 * PATCH /api/admin/drafts/[id] — edit parsedJson (chapter numbers, isSensitive)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const draft = await prisma.draftIngestion.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  return NextResponse.json(draft);
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const draft = await prisma.draftIngestion.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (draft.reviewedAt) {
    return NextResponse.json({ error: "Draft already reviewed, cannot edit" }, { status: 409 });
  }

  const body = await req.json();
  const { parsedJson } = body;

  if (!parsedJson) {
    return NextResponse.json({ error: "parsedJson required" }, { status: 400 });
  }

  const updated = await prisma.draftIngestion.update({
    where: { id },
    data: { parsedJson },
  });

  return NextResponse.json(updated);
}
