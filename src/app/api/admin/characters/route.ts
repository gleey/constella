/**
 * GET /api/admin/characters?mediaId=...
 * List characters for a media (used by review page for name resolution dropdown).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const mediaId = new URL(req.url).searchParams.get("mediaId");
  if (!mediaId) return NextResponse.json({ error: "mediaId required" }, { status: 400 });

  const characters = await prisma.character.findMany({
    where: { mediaId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(characters);
}
