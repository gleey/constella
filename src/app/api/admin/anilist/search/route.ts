/**
 * GET /api/admin/anilist/search?q=...
 * Proxy to AniList for media search autocomplete.
 */

import { NextRequest, NextResponse } from "next/server";
import { searchMedia } from "@/lib/anilist";

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q");
  if (!q) return NextResponse.json([]);
  const results = await searchMedia(q);
  return NextResponse.json(results);
}
