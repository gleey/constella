import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/media — list media from catalog.
 * Supports optional `?q=`, `?limit=`, `?offset=` for paginated callers while
 * preserving the full-array default for existing clients.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");

  const take =
    limitRaw && /^\d+$/.test(limitRaw)
      ? Math.min(200, Math.max(1, parseInt(limitRaw, 10)))
      : undefined;
  const skip =
    offsetRaw && /^\d+$/.test(offsetRaw)
      ? Math.max(0, parseInt(offsetRaw, 10))
      : undefined;

  const media = await prisma.media.findMany({
    where: q ? { title: { contains: q, mode: "insensitive" } } : undefined,
    select: {
      id: true,
      anilistId: true,
      title: true,
      type: true,
      totalChapters: true,
      coverImage: true,
      chapterNumberingSource: true,
      countryOfOrigin: true,
      status: true,
      contentRating: true,
      genres: true,
    },
    orderBy: { title: "asc" },
    ...(take !== undefined ? { take } : {}),
    ...(skip !== undefined ? { skip } : {}),
  });

  return NextResponse.json(media, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
