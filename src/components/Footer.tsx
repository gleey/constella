"use client";

import Link from "next/link";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-white/5 bg-[#080c14] text-slate-400 text-xs mt-auto">
      {/* Main footer grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 lg:gap-10">
          {/* Brand info */}
          <div className="space-y-3.5 md:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white flex items-center justify-center text-xs font-black shadow-md shadow-indigo-950/40 ring-1 ring-white/10">
                C
              </span>
              <span className="text-white font-bold tracking-tight text-base">
                Constella
              </span>
            </Link>
            <p className="text-slate-400 text-xs leading-relaxed">
              Interactive zero-spoiler character relationship map for manga and manhwa. Explore character cast connections chapter-by-chapter without ruining plot twists.
            </p>
            <div className="pt-1 flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Zero-Spoiler Engine Active
              </span>
            </div>
          </div>

          {/* Quick Navigation */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
              Navigation
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/" className="hover:text-indigo-300 transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/#catalog" className="hover:text-indigo-300 transition-colors">
                  Catalog & Exploration
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-indigo-300 transition-colors">
                  About Constella
                </Link>
              </li>
              <li>
                <Link href="/methodology" className="hover:text-indigo-300 transition-colors">
                  Methodology & Architecture
                </Link>
              </li>
              <li>
                <Link href="/status" className="hover:text-indigo-300 transition-colors">
                  Status Katalog & Lore
                </Link>
              </li>
            </ul>
          </div>

          {/* Community & Feedback */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
              Community & Audit
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a
                  href="https://github.com/gleey/constella/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-indigo-300 transition-colors flex items-center gap-1.5"
                >
                  <span>Report Spoiler / Data Issue</span>
                  <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/gleey/constella"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-indigo-300 transition-colors flex items-center gap-1.5"
                >
                  <span>GitHub Repository</span>
                  <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/gleey/constella/issues/new?title=%5BRequest%5D+Series+Addition"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-indigo-300 transition-colors"
                >
                  Request a Series
                </a>
              </li>
            </ul>
          </div>

          {/* Sources & Licensing Attribution */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
              Data Attribution
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Series metadata, covers, genres, and release statuses are powered by the{" "}
              <a
                href="https://anilist.co"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-300 hover:text-indigo-300 underline underline-offset-2"
              >
                AniList GraphQL API
              </a>
              .
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Character lore and wikis are aggregated from community wikis under the{" "}
              <a
                href="https://creativecommons.org/licenses/by-sa/3.0/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-300 hover:text-indigo-300 underline underline-offset-2"
              >
                CC-BY-SA 3.0 License
              </a>
              .
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Fallback character sources:{" "}
              <a
                href="https://en.wikipedia.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-300 hover:text-indigo-300 underline underline-offset-2"
              >
                Wikipedia
              </a>{" "}
              (CC-BY-SA 4.0) and the{" "}
              <a
                href="https://kitsu.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-300 hover:text-indigo-300 underline underline-offset-2"
              >
                Kitsu API
              </a>{" "}
              (rosters, aliases, portraits, release status; free public API per{" "}
              <a
                href="https://kitsu.io/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-300 hover:text-indigo-300 underline underline-offset-2"
              >
                Kitsu ToS
              </a>
              ).
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Live chapter counts for ongoing series come from the{" "}
              <a
                href="https://api.mangaupdates.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-300 hover:text-indigo-300 underline underline-offset-2"
              >
                MangaUpdates API
              </a>{" "}
              (public API per{" "}
              <a
                href="https://www.mangaupdates.com/aboutus"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-300 hover:text-indigo-300 underline underline-offset-2"
              >
                MangaUpdates ToS
              </a>
              ).
            </p>
          </div>
        </div>

        {/* Security & Zero-Spoiler Disclaimer Banner */}
        <div className="mt-10 p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-1.5">
          <div className="flex items-center gap-2 text-slate-300 font-semibold text-xs">
            <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Two-Layer Zero-Spoiler Guarantee & Content Disclaimer</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Data security is enforced server-side via chapter boundaries (<code className="text-indigo-300">validFrom</code> / <code className="text-indigo-300">validUntil</code>). Future spoilers are strictly excluded from API responses for past chapters. Relational edges and character bios are enriched semi-automatically with AI and reviewed by maintainers; community variations may occur.
          </p>
        </div>

        {/* Bottom copyright notice */}
        <div className="mt-8 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-500 text-[11px]">
          <p>
            &copy; {currentYear} Constella. Non-commercial fan and academic research project.
          </p>
          <p className="text-center sm:text-right">
            All manhwa/manga artworks, titles, and trademarks belong to their respective creators and publishers.
          </p>
        </div>
      </div>
    </footer>
  );
}