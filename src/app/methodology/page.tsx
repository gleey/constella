import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_METHODOLOGY_CONTENT } from "@/lib/site-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Methodology & Architecture — Constella",
  description:
    "How Constella achieves zero-spoiler safety and orchestrates its character relationship pipelines.",
};

export default async function MethodologyPage() {
  let page: { title: string; content: string } = DEFAULT_METHODOLOGY_CONTENT;

  try {
    const stored = await prisma.sitePage.findUnique({ where: { slug: "methodology" } });
    if (stored) {
      page = { title: stored.title, content: stored.content };
    }
  } catch (error) {
    console.error("Failed to load methodology page:", error);
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

        <div className="mt-8 flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#818cf8]">
            Technical Documentation
          </p>
        </div>

        <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-white">
          {page.title}
        </h1>

        <div className="mt-8 space-y-6 text-[15px] leading-7 text-slate-300">
          {paragraphs.map((paragraph, index) => {
            // Check if paragraph is a section header like "1. Two-Layer Zero-Spoiler Guarantee"
            const isHeader = /^[0-9]+\.\s+/.test(paragraph);
            return (
              <div key={index} className={isHeader ? "pt-4" : ""}>
                {isHeader ? (
                  <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                    <span className="text-indigo-400">{paragraph.split(" ")[0]}</span>
                    <span>{paragraph.replace(/^[0-9]+\.\s+/, "")}</span>
                  </h2>
                ) : (
                  <p className="whitespace-pre-line leading-relaxed text-slate-300">
                    {paragraph}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Feature summary card */}
        <div className="mt-14 rounded-2xl bg-white/[0.02] ring-1 ring-white/10 p-6 sm:p-7 space-y-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">Zero Leakage Verification</h3>
              <p className="text-xs text-slate-400">Deterministic regression tested via automated test suites</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Our test suites (<code className="text-indigo-300 font-mono">tests/graph.test.ts</code>) simulate edge cases where users seek future nodes in earlier chapters. The API enforces strict 404/empty responses for temporal out-of-bound requests.
          </p>
          <div className="pt-2 flex items-center gap-3">
            <Link
              href="/#catalog"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
            >
              Explore Catalog
            </Link>
            <Link
              href="/about"
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition-colors"
            >
              Read Project Story
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
