"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import Link from "next/link";

interface MediaItem {
  id: string;
  title: string;
  type: string;
  coverImage: string;
  totalChapters: number;
  chapterNumberingSource: string;
  countryOfOrigin: string;
}

// Curated metadata for presentation
const MEDIA_META: Record<
  string,
  { rating: string; genres: string[]; badge?: string }
> = {
  "Solo Leveling": {
    rating: "9.9",
    genres: ["Action", "Fantasy", "System"],
    badge: "Top Trending",
  },
  "Omniscient Reader's Viewpoint": {
    rating: "9.9",
    genres: ["Apocalypse", "Action", "Psychological"],
    badge: "Masterpiece",
  },
  "The Beginning After the End": {
    rating: "9.8",
    genres: ["Isekai", "Magic", "Reincarnation"],
  },
  "The World After the Fall": {
    rating: "9.6",
    genres: ["Tower", "Dark Fantasy", "Action"],
  },
  "Tower of God": {
    rating: "9.8",
    genres: ["Mystery", "Adventure", "Tower"],
  },
  Overgeared: {
    rating: "9.6",
    genres: ["VRMMO", "Action", "Comedy"],
  },
  "Solo Max-Level Newbie": {
    rating: "9.5",
    genres: ["Action", "Fantasy", "Tower"],
  },
  "Revenge of the Iron-Blooded Sword Hound": {
    rating: "9.8",
    genres: ["Revenge", "Swordsmanship", "Action"],
    badge: "Hot Release",
  },
  "The Player That Returned 10,000 Years Later": {
    rating: "9.7",
    genres: ["Demons", "Action", "Returner"],
    badge: "Popular",
  },
  "The Extra's Academy Survival Guide": {
    rating: "9.7",
    genres: ["Academy", "Magic", "Survival"],
  },
  "Myst, Might, Mayhem": {
    rating: "9.8",
    genres: ["Murim", "Demonic Cult", "Martial Arts"],
    badge: "Rising",
  },
  "Surviving the Game as a Barbarian": {
    rating: "9.7",
    genres: ["Dungeon", "Survival", "Dark Fantasy"],
  },
};

function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.29 3.96a1 1 0 0 0 .95.69h4.16c.97 0 1.37 1.24.59 1.81l-3.37 2.45a1 1 0 0 0-.36 1.12l1.28 3.96c.3.92-.75 1.69-1.54 1.12l-3.36-2.44a1 1 0 0 0-1.18 0l-3.36 2.44c-.79.57-1.84-.2-1.54-1.12l1.28-3.96a1 1 0 0 0-.36-1.12L2.06 9.39c-.78-.57-.38-1.81.59-1.81h4.16a1 1 0 0 0 .95-.69l1.29-3.96Z" />
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
      aria-hidden
    >
      <path
        d="M4 10h11m0 0-4-4m4 4-4 4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
      aria-hidden
    >
      <path
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function HomePage() {
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadMedia() {
      try {
        const res = await fetch("/api/media");
        if (res.ok) {
          const list: MediaItem[] = await res.json();
          setMediaList(list);
        }
      } catch (err) {
        console.error("Failed to load media catalog", err);
      } finally {
        setLoading(false);
      }
    }
    loadMedia();
  }, []);

  // Featured rail tampil acak tiap kali halaman dibuka, tanpa mengubah
  // urutan katalog di bawah (tetap urutan API).
  const featuredMedia = useMemo(() => {
    const list = [...mediaList];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }, [mediaList]);

  // Filter list
  const filteredMedia = mediaList.filter((m) => {
    const matchesSearch =
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.type.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (selectedFilter === "ALL") return true;
    if (selectedFilter === "MANHWA") return m.type === "MANHWA";
    if (selectedFilter === "MANGA") return m.type === "MANGA";
    return true;
  });

  const scrollLeft = () => {
    if (carouselRef.current) {
      carouselRef.current.scrollBy({ left: -340, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (carouselRef.current) {
      carouselRef.current.scrollBy({ left: 340, behavior: "smooth" });
    }
  };

  const tabs = ["ALL", "MANHWA", "MANGA"] as const;
  const tabLabels: Record<string, string> = {
    ALL: `All (${mediaList.length})`,
    MANHWA: "Manhwa",
    MANGA: "Manga",
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] aurora text-slate-100 flex flex-col selection:bg-indigo-500/30 selection:text-white">
      {/* ── 1. Featured showcase rail ── */}
      <section className="relative w-full border-b border-white/5 overflow-hidden bg-[#0d1322]">
        {/* Background image with blur + tint */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <Image
            src="/bg.jpg"
            alt="Hero Background"
            fill
            priority
            className="object-cover object-center blur-md opacity-20 scale-105"
          />
          <div className="absolute inset-0 bg-[#0b0f19]/85" />
        </div>

        {/* Carousel content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
          <div className="flex items-center justify-between gap-4 mb-7">
            <div className="flex items-center gap-3.5">
              <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-indigo-500/15 text-[#a5b4fc] ring-1 ring-indigo-500/30">
                Featured Today
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight hidden sm:block">
                Interactive Spoiler-Free Story Maps
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={scrollLeft}
                aria-label="Scroll Left"
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center ring-1 ring-white/10 hover:ring-indigo-500/50 transition cursor-pointer"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path d="M12 4l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                onClick={scrollRight}
                aria-label="Scroll Right"
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center ring-1 ring-white/10 hover:ring-indigo-500/50 transition cursor-pointer"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path d="M8 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Horizontal scroll rail */}
          {loading ? (
            <div className="flex gap-4 overflow-hidden py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="w-64 sm:w-72 h-96 rounded-2xl bg-white/[0.03] ring-1 ring-white/5 animate-pulse shrink-0"
                />
              ))}
            </div>
          ) : mediaList.length > 0 ? (
            <div
              ref={carouselRef}
              className="flex items-stretch gap-4 overflow-x-auto scroll-smooth no-scrollbar py-2 px-0.5"
              style={{ scrollSnapType: "x mandatory" }}
            >
              {featuredMedia.map((item) => {
                const meta = MEDIA_META[item.title];
                return (
                  <Link
                    key={item.id}
                    href={`/media/${item.id}`}
                    style={{ scrollSnapAlign: "start" }}
                    className="w-64 sm:w-72 shrink-0 flex flex-col rounded-2xl overflow-hidden bg-[#111827] ring-1 ring-white/5 hover:ring-indigo-500/60 hover:-translate-y-1 transition-all duration-300 shadow-lg shadow-black/40 hover:shadow-2xl hover:shadow-black/60 group cursor-pointer"
                  >
                    {/* Cover art */}
                    <div className="relative w-full h-80 sm:h-96 bg-[#161f30] overflow-hidden">
                      {item.coverImage ? (
                        <Image
                          src={item.coverImage}
                          alt={item.title}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                          No Cover
                        </div>
                      )}

                      {/* Bottom gradient scrim */}
                      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0b0f19] via-[#0b0f19]/60 to-transparent" />

                      {/* Top badges */}
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-[#0b0f19]/85 text-[#7dd3fc] ring-1 ring-white/10 backdrop-blur-md">
                          {item.type}
                        </span>
                        {meta?.badge && (
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-[#161f30]/85 text-[#c7d2fe] ring-1 ring-white/10 backdrop-blur-md">
                            {meta.badge}
                          </span>
                        )}
                      </div>

                      {meta?.rating && (
                        <div className="absolute top-3 right-3 z-10">
                          <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#0b0f19]/85 text-[#fcd34d] ring-1 ring-white/10 backdrop-blur-md flex items-center gap-1">
                            <StarIcon className="w-3 h-3" />
                            {meta.rating}
                          </span>
                        </div>
                      )}

                      {/* Info bar over the scrim */}
                      <div className="absolute bottom-0 inset-x-0 p-4 space-y-1.5 z-10">
                        <div className="flex flex-wrap items-center gap-1">
                          {meta?.genres?.slice(0, 2).map((g) => (
                            <span
                              key={g}
                              className="px-2 py-0.5 rounded-md bg-white/5 text-slate-300 text-[10px] font-medium ring-1 ring-white/10"
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                        <h3 className="text-sm font-bold text-white group-hover:text-[#a5b4fc] transition-colors truncate">
                          {item.title}
                        </h3>
                        <div className="flex items-center justify-between text-xs pt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">
                            {item.totalChapters} Chapters
                          </span>
                          <span className="text-[#a5b4fc] font-bold text-[11px] group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                            <span>Explore Map</span>
                            <ArrowIcon className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      {/* ── 2. Catalog with search & filter tabs ── */}
      <section
        id="catalog"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14 flex-1 w-full"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-9">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Manga &amp; Manhwa Catalog
            </h2>
            <p className="text-sm text-slate-400 mt-1.5">
              Select any story map to explore chapter-by-chapter character journeys
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Filter tabs */}
            <div className="flex items-center p-1 bg-white/[0.04] ring-1 ring-white/10 rounded-full text-xs font-semibold text-slate-400">
              {tabs.map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedFilter(t)}
                  className={`px-3.5 py-1.5 rounded-full transition cursor-pointer ${
                    selectedFilter === t
                      ? "bg-indigo-500/20 text-[#c7d2fe] ring-1 ring-indigo-500/40"
                      : "hover:text-slate-200"
                  }`}
                >
                  {tabLabels[t]}
                </button>
              ))}
            </div>

            {/* Search input */}
            <div className="relative flex-1 md:w-64">
              <input
                type="text"
                placeholder="Search title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 pl-9 pr-9 bg-white/[0.04] ring-1 ring-white/10 focus:ring-2 focus:ring-indigo-500/60 rounded-full text-xs text-white placeholder-slate-500 focus:outline-none transition"
              />
              <SearchIcon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition cursor-pointer"
                  aria-label="Clear search"
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                    <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Catalog grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl bg-white/[0.03] ring-1 ring-white/5 h-80 animate-pulse"
              />
            ))}
          </div>
        ) : filteredMedia.length === 0 ? (
          <div className="p-14 text-center rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
            <p className="text-slate-300 text-sm font-medium mb-4">
              No manga found matching &quot;{search}&quot;
            </p>
            <button
              onClick={() => setSearch("")}
              className="px-5 py-2.5 rounded-full bg-indigo-500/15 text-[#a5b4fc] text-xs font-semibold ring-1 ring-indigo-500/40 hover:bg-indigo-500/25 transition cursor-pointer"
            >
              Clear Search Filter
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5 sm:gap-6">
            {filteredMedia.map((m) => {
              const meta = MEDIA_META[m.title];
              return (
                <Link
                  key={m.id}
                  href={`/media/${m.id}`}
                  className="group rounded-2xl overflow-hidden bg-[#111827] ring-1 ring-white/5 hover:ring-indigo-500/60 hover:-translate-y-1 transition-all duration-300 shadow-lg shadow-black/40 hover:shadow-2xl hover:shadow-black/60 flex flex-col cursor-pointer"
                >
                  {/* Cover image */}
                  <div className="relative w-full aspect-[3/4] bg-[#161f30] overflow-hidden">
                    {m.coverImage ? (
                      <Image
                        src={m.coverImage}
                        alt={m.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                        No Cover
                      </div>
                    )}
                    {/* Bottom scrim */}
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0b0f19]/80 to-transparent" />

                    {/* Badges */}
                    <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-[#0b0f19]/85 text-[#7dd3fc] ring-1 ring-white/10 backdrop-blur-md">
                        {m.type}
                      </span>
                    </div>
                    {meta?.rating && (
                      <div className="absolute top-2.5 right-2.5">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#0b0f19]/85 text-[#fcd34d] ring-1 ring-white/10 backdrop-blur-md flex items-center gap-1">
                          <StarIcon className="w-2.5 h-2.5" />
                          {meta.rating}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <h3 className="text-sm font-bold text-white group-hover:text-[#a5b4fc] transition-colors line-clamp-1">
                        {m.title}
                      </h3>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{m.totalChapters} Ch.</span>
                        <span aria-hidden>·</span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {m.chapterNumberingSource}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-white/5 flex items-center justify-between text-xs font-semibold text-[#a5b4fc]">
                      <span>View Story Map</span>
                      <ArrowIcon className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
