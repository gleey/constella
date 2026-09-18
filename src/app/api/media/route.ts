import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncPopularMedia } from "@/lib/auto-sync";

/** GET /api/media — list all media (with auto-sync if catalog has <= 2 titles). */
export async function GET() {
  let count = await prisma.media.count();
  if (count <= 2) {
    try {
      await syncPopularMedia();
    } catch (err) {
      console.error("Auto-sync error:", err);
    }
  }

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
    },
    orderBy: { title: "asc" },
  });
  return NextResponse.json(media);
}
