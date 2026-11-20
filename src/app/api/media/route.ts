import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { importCatalog } from "@/lib/catalog-import";

/** GET /api/media — list all media, bulk-importing AniList catalog when sparse. */
export async function GET() {
  const count = await prisma.media.count();
  if (count < 200) {
    try {
      const result = await importCatalog({ maxPages: 4, perPage: 50 });
      console.log(
        `Catalog import: ${result.imported} new, ${result.updated} updated, ${result.skipped} skipped`,
      );
    } catch (err) {
      console.error("Catalog import error:", err);
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
      status: true,
      contentRating: true,
      genres: true,
    },
    orderBy: { title: "asc" },
  });
  return NextResponse.json(media);
}
