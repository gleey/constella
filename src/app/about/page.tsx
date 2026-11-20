import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ABOUT_CONTENT } from "@/lib/site-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "About — Constella",
  description:
    "How Constella keeps character maps spoiler-free and where its data comes from.",
};

export default async function AboutPage() {
  let page: { title: string; content: string } = DEFAULT_ABOUT_CONTENT;

  try {
    const stored = await prisma.sitePage.findUnique({ where: { slug: "about" } });
    if (stored) {
      page = { title: stored.title, content: stored.content };
    }
  } catch (error) {
    console.error("Failed to load about page:", error);
  }

  const paragraphs = page.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-[#0b0f19] aurora text-slate-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to home
        </Link>

        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-[#818cf8]">
          About the project
        </p>
        <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-white">
          {page.title}
        </h1>

        <div className="mt-8 space-y-5 text-[15px] leading-7 text-slate-300">
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>

        <div className="mt-12 rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-white">Keep exploring</h2>
          <p className="mt-2 text-sm text-slate-400">
            Jump into the catalog, pick a series, and move the chapter slider to
            see the cast as it is revealed.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/#catalog"
              className="px-4 py-2 rounded-full text-sm font-semibold bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white hover:brightness-110 transition"
            >
              Browse catalog
            </Link>
            <Link
              href="/"
              className="px-4 py-2 rounded-full text-sm font-medium text-slate-300 bg-white/5 ring-1 ring-white/10 hover:bg-white/10 transition"
            >
              Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
