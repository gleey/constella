"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";

interface MediaCoverage {
  id: string;
  title: string;
  coverImage: string | null;
  totalChapters: number;
  characterCount: number;
  relationshipCount: number;
}

interface StatusClientProps {
  initialMedia: MediaCoverage[];
}

function getTier(media: MediaCoverage): "tier3" | "tier2" | "tier1" {
  if (media.relationshipCount > 0) return "tier3";
  if (media.characterCount > 0) return "tier2";
  return "tier1";
}

const TIER_LABELS = {
  tier3: "Tier 3 — Relasi Aktif",
  tier2: "Tier 2 — Karakter Saja",
  tier1: "Tier 1 — Metadata Saja",
} as const;

const TIER_SHORT = {
  tier3: "Tier 3",
  tier2: "Tier 2",
  tier1: "Tier 1",
} as const;

const TIER_BADGE_STYLE = {
  tier3: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  tier2: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  tier1: "bg-slate-500/15 text-slate-300 border-slate-500/30",
} as const;

const PAGE_SIZE = 24;

export default function StatusClient({ initialMedia }: StatusClientProps) {
  const [filter, setFilter] = useState<"all" | "tier3" | "tier2" | "tier1">("all");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  const filteredMedia = useMemo(() => {
    return initialMedia.filter((m) => {
      const tier = getTier(m);
      if (filter !== "all" && tier !== filter) return false;
      if (search.trim() && !m.title.toLowerCase().includes(search.trim().toLowerCase()))
        return false;
      return true;
    });
  }, [initialMedia, filter, search]);

  const displayedMedia = useMemo(() => {
    return filteredMedia.slice(0, visibleCount);
  }, [filteredMedia, visibleCount]);

  const handleFilterChange = (f: "all" | "tier3" | "tier2" | "tier1") => {
    setFilter(f);
    setVisibleCount(PAGE_SIZE);
  };

  const handleSearchChange = (v: string) => {
    setSearch(v);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <div className="mt-10 space-y-6">
      {/* Filter & Search */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 shrink-0">Filter Tier:</span>
          {["all", "tier3", "tier2", "tier1"].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => handleFilterChange(f as typeof filter)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filter === f
                  ? f === "all"
                    ? "bg-indigo-600 text-white ring-1 ring-indigo-500/40"
                    : `bg-${({ tier3: "emerald", tier2: "amber", tier1: "slate" } as const)[f]}-500/20 text-${({ tier3: "emerald", tier2: "amber", tier1: "slate" } as const)[f]}-300 ring-1 ring-${({ tier3: "emerald", tier2: "amber", tier1: "slate" } as const)[f]}-500/40`
                  : "bg-white/5 hover:bg-white/10 text-slate-300 ring-1 ring-white/10"
              }`}
            >
              {f === "all" ? "Semua" : TIER_SHORT[f as keyof typeof TIER_SHORT]}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-80">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Cari judul..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#111827] border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-sm"
          />
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-slate-400">
        Menampilkan <span className="text-white font-semibold">{displayedMedia.length}</span> dari{" "}
        <span className="text-white font-semibold">{filteredMedia.length}</span> seri
        {filter !== "all" && (
          <>
            &nbsp;|&nbsp;
            <span className={`font-semibold ${TIER_BADGE_STYLE[filter]}`}>
              {TIER_LABELS[filter]}
            </span>
          </>
        )}
      </p>

      {/* Grid */}
      {filteredMedia.length === 0 ? (
        <div className="p-14 text-center rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
          <p className="text-slate-300 text-sm font-medium mb-4">
            Tidak ada seri yang cocok dengan filter atau pencarian.
          </p>
          <button
            onClick={() => {
              handleFilterChange("all");
              handleSearchChange("");
            }}
            className="px-5 py-2.5 rounded-full bg-indigo-500/15 text-[#a5b4fc] text-xs font-semibold ring-1 ring-indigo-500/40 hover:bg-indigo-500/25 transition cursor-pointer"
          >
            Reset Filter
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayedMedia.map((m) => {
              const tier = getTier(m);
              return (
                <Link
                  key={m.id}
                  href={`/media/${m.id}`}
                  className="group flex flex-col rounded-2xl overflow-hidden bg-[#111827] ring-1 ring-white/5 hover:ring-indigo-500/50 hover:-translate-y-0.5 transition-all duration-300 shadow-lg shadow-black/40"
                >
                  {/* Cover */}
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
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0b0f19]/80 to-transparent" />

                    {/* Tier Badge */}
                    <div className="absolute top-2.5 left-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ring-1 backdrop-blur-md ${
                          TIER_BADGE_STYLE[tier]
                        }`}
                      >
                        {TIER_SHORT[tier]}
                      </span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3 min-h-[120px]">
                    <div>
                      <h3 className="text-sm font-bold text-white group-hover:text-[#a5b4fc] transition-colors line-clamp-1">
                        {m.title}
                      </h3>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{m.totalChapters} Ch.</span>
                        <span aria-hidden>·</span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {m.characterCount} Karakter
                        </span>
                        {m.relationshipCount > 0 && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="font-mono text-[10px] text-emerald-400 font-semibold">
                              {m.relationshipCount} Relasi
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-white/5 flex items-center justify-between text-xs font-semibold text-[#a5b4fc]">
                      <span>Buka Graph</span>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Show More Button */}
          {filteredMedia.length > visibleCount && (
            <div className="mt-10 flex flex-col items-center justify-center gap-3">
              <p className="text-xs text-slate-400 font-medium">
                Menampilkan <span className="text-white font-bold">{displayedMedia.length}</span> dari{" "}
                <span className="text-white font-bold">{filteredMedia.length}</span> seri
              </p>
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-950/50 hover:shadow-indigo-500/25 ring-1 ring-white/10 transition-all cursor-pointer flex items-center gap-2"
              >
                <span>Tampilkan Lebih Banyak</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}