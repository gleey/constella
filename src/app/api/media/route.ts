import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET /api/media — list all media from catalog */
export async function GET() {
  const media = await prisma.media.findMany({
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
  });
  return NextResponse.json(media, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
