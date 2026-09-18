"use client";

import { useState, useEffect, useRef } from "react";
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

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col selection:bg-[#1e293b] selection:text-[#38bdf8]">
      {/* ── 1. Featured Manga Horizontal Showcase Strip (Image 1 Style with bg.jpg blur) ── */}
      <section className="relative w-full border-b border-[#1e293b] overflow-hidden bg-[#0d1322]">
        {/* Background image container with blur and dark tint */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <Image
            src="/bg.jpg"
            alt="Hero Background"
            fill
            priority
            className="object-cover object-center filter blur-md opacity-25 scale-105"
          />
          <div className="absolute inset-0 bg-[#0b0f19]/85" />
        </div>

        {/* Carousel Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          {/* Header & Controls */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#161f30] text-[#818cf8] border border-[#27354f]">
                Featured Today
              </span>
              <h2 className="text-base sm:text-lg font-bold text-white hidden sm:block">
                Interactive Spoiler-Free Story Maps
              </h2>
            </div>
            {/* Carousel navigation buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={scrollLeft}
                aria-label="Scroll Left"
                className="w-9 h-9 rounded-xl bg-[#161f30] hover:bg-[#1e293b] text-slate-300 hover:text-white flex items-center justify-center border border-[#27354f] hover:border-[#818cf8] transition cursor-pointer text-base font-bold shadow-md"
              >
                ‹
              </button>
              <button
                onClick={scrollRight}
                aria-label="Scroll Right"
                className="w-9 h-9 rounded-xl bg-[#161f30] hover:bg-[#1e293b] text-slate-300 hover:text-white flex items-center justify-center border border-[#27354f] hover:border-[#818cf8] transition cursor-pointer text-base font-bold shadow-md"
              >
                ›
              </button>
            </div>
          </div>

          {/* Horizontal Scroll Rail */}
          {loading ? (
            <div className="flex gap-4 overflow-hidden py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="w-64 sm:w-72 h-96 rounded-2xl bg-[#111827] border border-[#1e293b] animate-pulse shrink-0"
                />
              ))}
            </div>
          ) : mediaList.length > 0 ? (
            <div
              ref={carouselRef}
              className="flex items-stretch gap-4 overflow-x-auto scroll-smooth no-scrollbar py-2 px-0.5"
              style={{ scrollSnapType: "x mandatory" }}
            >
              {mediaList.map((item) => {
                const meta = MEDIA_META[item.title];
                return (
                  <Link
                    key={item.id}
                    href={`/media/${item.id}`}
                    style={{ scrollSnapAlign: "start" }}
                    className="w-64 sm:w-72 shrink-0 flex flex-col bg-[#111827] border border-[#1e293b] hover:border-[#818cf8] rounded-2xl overflow-hidden transition-all duration-300 shadow-xl hover:shadow-2xl group cursor-pointer"
                  >
                    {/* Cover Art */}
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

                      {/* Top Badges */}
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
                        <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#0b0f19]/90 text-[#38bdf8] border border-[#1e293b] backdrop-blur-md">
                          {item.type}
                        </span>
                        {meta?.badge && (
                          <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#161f30]/90 text-[#c7d2fe] border border-[#27354f] backdrop-blur-md">
                            {meta.badge}
                          </span>
                        )}
                      </div>

                      {meta?.rating && (
                        <div className="absolute top-3 right-3 z-10">
                          <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#0b0f19]/90 text-[#fbbf24] border border-[#1e293b] backdrop-blur-md flex items-center gap-1 shadow">
                            ⭐ {meta.rating}
                          </span>
                        </div>
                      )}

                      {/* Solid Dark Bottom Bar on Image */}
                      <div className="absolute bottom-0 inset-x-0 bg-[#0b0f19]/90 backdrop-blur-sm border-t border-[#1e293b] p-3.5 space-y-1.5 z-10">
                        <div className="flex flex-wrap items-center gap-1">
                          {meta?.genres?.slice(0, 2).map((g) => (
                            <span
                              key={g}
                              className="px-2 py-0.5 rounded bg-[#161f30] text-slate-300 text-[10px] font-medium border border-[#27354f]"
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                        <h3 className="text-sm font-bold text-white group-hover:text-[#818cf8] transition-colors truncate">
                          {item.title}
                        </h3>
                        <div className="flex items-center justify-between text-xs pt-0.5">
                          <span className="text-slate-400 font-mono text-[11px]">
                            {item.totalChapters} Chapters
                          </span>
                          <span className="text-[#818cf8] font-bold text-[11px] group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                            <span>Explore Map</span>
                            <span>→</span>
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

      {/* ── 2. Catalog Section with Search & Filter Tabs ── */}
      <section
        id="catalog"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 flex-1 w-full"
      >
        {/* Controls: Search & Category Tabs */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Manga & Manhwa Catalog
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Select any story map to explore chapter-by-chapter character journeys
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Filter Tabs */}
            <div className="flex items-center p-1 bg-[#111827] border border-[#1e293b] rounded-xl text-xs font-semibold text-slate-400">
              <button
                onClick={() => setSelectedFilter("ALL")}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  selectedFilter === "ALL"
                    ? "bg-[#161f30] text-white border border-[#27354f]"
                    : "hover:text-slate-200"
                }`}
              >
                All ({mediaList.length})
              </button>
              <button
                onClick={() => setSelectedFilter("MANHWA")}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  selectedFilter === "MANHWA"
                    ? "bg-[#161f30] text-white border border-[#27354f]"
                    : "hover:text-slate-200"
                }`}
              >
                Manhwa
              </button>
              <button
                onClick={() => setSelectedFilter("MANGA")}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  selectedFilter === "MANGA"
                    ? "bg-[#161f30] text-white border border-[#27354f]"
                    : "hover:text-slate-200"
                }`}
              >
                Manga
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 md:w-64">
              <input
                type="text"
                placeholder="Search title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-8 pr-3 bg-[#111827] border border-[#1e293b] focus:border-[#818cf8] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none transition"
              />
              <span className="absolute left-2.5 top-2.5 text-xs text-slate-500 pointer-events-none">
                🔍
              </span>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-2 text-xs text-slate-500 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Catalog Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="bg-[#111827] border border-[#1e293b] rounded-2xl h-80 animate-pulse"
              />
            ))}
          </div>
        ) : filteredMedia.length === 0 ? (
          <div className="p-12 text-center bg-[#111827] border border-[#1e293b] rounded-2xl">
            <p className="text-slate-400 text-sm font-medium mb-2">
              No manga found matching &quot;{search}&quot;
            </p>
            <button
              onClick={() => setSearch("")}
              className="px-4 py-2 rounded-xl bg-[#161f30] text-[#38bdf8] text-xs font-semibold border border-[#27354f] hover:bg-[#1e293b] cursor-pointer"
            >
              Clear Search Filter
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-5 sm:gap-6">
            {filteredMedia.map((m) => {
              const meta = MEDIA_META[m.title];
              return (
                <Link
                  key={m.id}
                  href={`/media/${m.id}`}
                  className="group bg-[#111827] border border-[#1e293b] hover:border-[#818cf8]/60 rounded-2xl overflow-hidden transition-all shadow-lg hover:shadow-2xl flex flex-col cursor-pointer"
                >
                  {/* Cover image container */}
                  <div className="relative w-full aspect-[3/4] bg-[#161f30] overflow-hidden">
                    {m.coverImage ? (
                      <Image
                        src={m.coverImage}
                        alt={m.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                        No Cover
                      </div>
                    )}
                    {/* Badges on cover */}
                    <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#0b0f19]/90 text-[#38bdf8] border border-[#1e293b] shadow">
                        {m.type}
                      </span>
                    </div>
                    {meta?.rating && (
                      <div className="absolute top-2.5 right-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#0b0f19]/90 text-[#fbbf24] border border-[#1e293b] shadow flex items-center gap-1">
                          ⭐ {meta.rating}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info card */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <h3 className="text-sm font-bold text-white group-hover:text-[#818cf8] transition-colors line-clamp-1">
                        {m.title}
                      </h3>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{m.totalChapters} Ch.</span>
                        <span>•</span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {m.chapterNumberingSource}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#1e293b] flex items-center justify-between text-xs font-semibold text-[#818cf8] group-hover:text-[#a5b4fc]">
                      <span>View Story Map</span>
                      <span className="group-hover:translate-x-0.5 transition-transform">
                        →
                      </span>
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
