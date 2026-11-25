import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import {
  DEFAULT_ABOUT_CONTENT,
  DEFAULT_METHODOLOGY_CONTENT,
  isSitePageSlug,
  type SitePageSlug,
} from "@/lib/site-page";

type RouteContext = { params: Promise<{ slug: string }> };

const DEFAULTS: Record<SitePageSlug, { title: string; content: string }> = {
  about: DEFAULT_ABOUT_CONTENT,
  methodology: DEFAULT_METHODOLOGY_CONTENT,
};

/**
 * GET /api/pages/[slug]
 * Public read. Falls back to the built-in default when the page has not been
 * saved from the admin dashboard yet.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { slug } = await ctx.params;
  if (!isSitePageSlug(slug)) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const page = await prisma.sitePage.findUnique({ where: { slug } });
  return NextResponse.json(page ?? { slug, ...DEFAULTS[slug] });
}

/**
 * PUT /api/pages/[slug]
 * Admin save. Upserts the page content.
 */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { slug } = await ctx.params;
  if (!isSitePageSlug(slug)) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    const content = String(body.content ?? "").trim();

    if (!title || !content) {
      return NextResponse.json(
        { error: "Title and content are required" },
        { status: 400 },
      );
    }

    if (title.length > 160 || content.length > 20000) {
      return NextResponse.json(
        { error: "Title or content is too long" },
        { status: 400 },
      );
    }

    const page = await prisma.sitePage.upsert({
      where: { slug },
      update: { title, content },
      create: { slug, title, content },
    });

    return NextResponse.json(page);
  } catch (error) {
    console.error("Error saving page:", error);
    return NextResponse.json({ error: "Failed to save page" }, { status: 500 });
  }
}
