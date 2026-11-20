/**
 * Editable static pages (About, etc.) managed from the admin dashboard.
 * Content is stored as plain text; blank lines separate paragraphs.
 */

export const SITE_PAGE_SLUGS = ["about"] as const;

export type SitePageSlug = (typeof SITE_PAGE_SLUGS)[number];

export function isSitePageSlug(value: string): value is SitePageSlug {
  return (SITE_PAGE_SLUGS as readonly string[]).includes(value);
}

export const DEFAULT_ABOUT_CONTENT = {
  title: "About Constella",
  content: `Constella is a zero-spoiler character map for manhwa and manga. Pick a chapter and the graph only shows what a reader is allowed to know at that point of the story.

Every character, relationship, status, and faction carries a chapter range. Nothing from later chapters leaks into an earlier view, so you can explore cast connections without ruining the story for yourself.

The catalog is pulled automatically from AniList. Character lore is enriched from public wiki sources and reviewed before it is published.

Use the chapter slider to travel through the story, click any node to read a bio and its relations, and search for a character even if they have not appeared yet.

Constella is an independent fan project. All artwork and character names belong to their respective creators and publishers.`,
} as const;
