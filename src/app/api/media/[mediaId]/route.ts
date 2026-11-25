import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeRelations, relatedMediaIds } from "@/lib/media-relations";
import { requireAdmin } from "@/lib/admin-auth";

/** GET /api/media/[mediaId] — media header fields + prequel/sequel links. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  const { mediaId } = await params;
  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: {
      id: true,
      anilistId: true,
      title: true,
      type: true,
      coverImage: true,
      totalChapters: true,
      chapterNumberingSource: true,
      relations: true,
    },
  });

  if (!media) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  const relations = normalizeRelations(media.relations);
  const targets = await relatedMediaIds(relations);

  return NextResponse.json({
    ...media,
    relations: relations.map((r) => ({ ...r, mediaId: targets.get(r.anilistId) ?? null })),
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const { mediaId } = await params;

    const media = await prisma.media.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }

    await prisma.media.delete({
      where: { id: mediaId },
    });

    return NextResponse.json({
      success: true,
      message: `Deleted "${media.title}" and all associated data`,
    });
  } catch (error) {
    console.error("Error deleting media:", error);
    return NextResponse.json(
      { error: "Failed to delete media" },
      { status: 500 }
    );
  }
}