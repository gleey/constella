/**
 * Editable static pages (About, etc.) managed from the admin dashboard.
 * Content is stored as plain text; blank lines separate paragraphs.
 */

export const SITE_PAGE_SLUGS = ["about", "methodology"] as const;

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

All text from fallback sources (Wikipedia and Kitsu) passes through the same AI extraction pipeline as Fandom wikitext, so chapter boundaries are enforced identically. Raw copyrighted prose is never republished — only structured extracted facts are stored.

Constella is an independent fan and research project. All artwork, titles, and character names belong to their respective creators and publishers.`,
} as const;

export const DEFAULT_METHODOLOGY_CONTENT = {
  title: "Methodology & Architecture",
  content: `Constella solves a widespread frustration among manga and manhwa readers: exploring character backgrounds and relations without accidentally encountering devastating plot spoilers.

1. Two-Layer Zero-Spoiler Guarantee
Most fan wikis show characters' final statuses and latest relationships on their primary profile pages. Constella implements a two-tier protection model:
- Server-Side Database Boundary: Every character node, relational edge, and faction affiliation is bounded by discrete chapter ranges (validFrom and validUntil). The API filters records deterministically in PostgreSQL queries. Data belonging to future chapters is never returned over the network, making inspect-element spoiler leaks physically impossible.
- Dynamic Graph Recomputation: In the browser, our Cytoscape.js canvas re-renders nodes and edges in real-time as the reader shifts the chapter slider, visualizing character revelations in lockstep with the reader's actual reading progress.

2. Three-Tier Ingestion & Lore Enrichment Pipeline
Data in Constella is structured across three verified tiers:
- Tier 1 (Canonical Discovery): Series titles, total chapter counts, covers, genres, and publication status are ingested directly via AniList GraphQL API. AniList reports no chapter count for series that are still releasing, so the live count is resolved from MangaUpdates, with Kitsu supplying the release status and an exact identity check through its anilist/manga mapping.
- Tier 2 (Character Profiles & Cast): Base character lists, aliases, and visual representations are retrieved from Fandom Community Wikis under Creative Commons Attribution-ShareAlike (CC-BY-SA). Dedicated wikis are discovered through Fandom's official unified search service rather than by guessing subdomains. When a series has no adequate Fandom wiki, the pipeline falls back to Wikipedia character articles (CC BY-SA 4.0) and the Kitsu character database.
- Tier 3 (Relational Synthesis & AI-Assisted Tagging): Intricate interpersonal dynamics (alliances, betrayals, rivalries, family trees, secret identities) are extracted from wiki story summaries using a resilient multi-provider LLM chain (Gemini, Groq, OpenRouter). Every relationship is assigned explicit validity intervals and held in an administrative review queue before publication.

3. Community Auditing & Open Verification
Because storytelling evolves across hundreds of chapters and scanlations, our administrative curation is complemented by community oversight. Readers can report discrepancies or misaligned chapter boundaries directly to our GitHub tracker.`,
} as const;
