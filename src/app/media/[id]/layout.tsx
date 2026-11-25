import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    const media = await prisma.media.findUnique({
      where: { id },
      select: { title: true, type: true, totalChapters: true, coverImage: true },
    });

    if (!media) {
      return {
        title: "Series Not Found — Constella",
        robots: { index: false },
      };
    }

    const title = `${media.title} — Spoiler-Free Character Map | Constella`;
    const description = `Explore ${media.title} (${media.type}, ${media.totalChapters} chapters) character relationships chapter by chapter without spoilers.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "article",
        images: media.coverImage ? [{ url: media.coverImage, alt: media.title }] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: media.coverImage ? [media.coverImage] : undefined,
      },
    };
  } catch {
    return {
      title: "Character Map — Constella",
    };
  }
}

export default function MediaDetailLayout({ children }: LayoutProps) {
  return children;
}
