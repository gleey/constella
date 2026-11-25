import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://constella.app").replace(/\/+$/, "");

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/methodology`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/status`, changeFrequency: "hourly", priority: 0.6 },
  ];

  try {
    const media = await prisma.media.findMany({
      select: { id: true },
      orderBy: { title: "asc" },
    });
    const mediaRoutes: MetadataRoute.Sitemap = media.map((m) => ({
      url: `${baseUrl}/media/${m.id}`,
      changeFrequency: "weekly",
      priority: 0.8,
    }));
    return [...staticRoutes, ...mediaRoutes];
  } catch {
    return staticRoutes;
  }
}
