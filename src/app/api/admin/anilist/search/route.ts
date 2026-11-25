/**
 * GET /api/admin/anilist/search?q=...
 * Proxy to AniList for media search autocomplete.
 */

import { NextRequest, NextResponse } from "next/server";
import { searchMedia } from "@/lib/anilist";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const q = new URL(req.url).searchParams.get("q");
  if (!q) return NextResponse.json([]);
  const results = await searchMedia(q);
  return NextResponse.json(results);
}
