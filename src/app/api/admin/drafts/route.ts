/**
 * GET /api/admin/drafts — list all drafts (optionally filter by mediaId, status)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const mediaId = searchParams.get("mediaId");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (mediaId) where.mediaId = mediaId;
  if (status) where.status = status;

  const drafts = await prisma.draftIngestion.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(drafts);
}
