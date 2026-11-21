"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
  status?: string;
  contentRating?: "SAFE" | "SUGGESTIVE_18" | string;
  genres?: string[];
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

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
      aria-hidden
    >
      <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LayersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden>
      <path d="M10 3 3 6.5 10 10l7-3.5L10 3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m3 10.5 7 3.5 7-3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m3 14.5 7 3.5 7-3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PulseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden>
      <circle cx="10" cy="10" r="3.25" stroke="currentColor" strokeWidth={1.5} />
      <circle cx="10" cy="10" r="6.75" stroke="currentColor" strokeLinecap="round" strokeDasharray="3 3" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden>
      <path d="M10 2.5s6 2 6 7c0 4.5-3.5 7.5-6 8.5-2.5-1-6-4-6-8.5 0-5 6-7 6-7Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RotateCcwIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden>
      <path d="M3.5 10a6.5 6.5 0 1 1 1.9 4.6L2.5 17" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 12.5V17H7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

/** Custom themed dropdown that replaces native <select> for dark-mode consistency. */
function FilterDropdown({
  value,
  onChange,
  options,
  icon: Icon,
  ariaLabel,
  activeClass,
  inactiveClass,
  iconActiveClass,
  iconInactiveClass,
  chevronClass,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  icon: React.ComponentType<{ className?: string }>;
  ariaLabel: string;
  activeClass: string;
  inactiveClass: string;
  iconActiveClass: string;
  iconInactiveClass: string;
  chevronClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = value !== options[0]?.value;
  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, close]);

  return (
    <div className={`relative ${open ? "z-50" : "z-10"}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-expanded={open}
        className={`flex items-center gap-2 h-10 pl-3 pr-9 rounded-xl text-sm font-medium focus:outline-none transition cursor-pointer select-none ${
          isActive ? activeClass : inactiveClass
        } ${open ? "ring-2 ring-indigo-500/50" : ""}`}
      >
        <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? iconActiveClass : iconInactiveClass}`} />
        <span className="whitespace-nowrap">{selectedLabel}</span>
        <ChevronDownIcon
          className={`w-4 h-4 absolute right-2.5 pointer-events-none transition-transform ${
            open ? "rotate-180" : ""
          } ${chevronClass ?? (isActive ? iconActiveClass : "text-slate-400")}`}
        />
      </button>

      {open && (
        <div className="absolute z-[60] mt-1.5 left-0 min-w-[170px] w-max rounded-xl border border-white/10 bg-[#0f172a] shadow-2xl shadow-black/80 p-1.5 backdrop-blur-xl">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                close();
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap text-left ${
                value === opt.value
                  ? "bg-white/[0.08] text-white"
                  : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {value === opt.value ? (
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0 text-indigo-400" aria-hidden>
                  <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                </svg>
              ) : (
                <span className="w-4 h-4 shrink-0" />
              )}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 24;

export default function HomePage() {
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [search, setSearch] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [selectedRating, setSelectedRating] = useState<string>("SAFE");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScrollLeft = useRef(0);
  const isDragThresholdPassed = useRef(false);

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Global shortcut: ⌘K or / to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        document.activeElement === searchInputRef.current ||
        (document.activeElement?.tagName === "INPUT" && document.activeElement !== searchInputRef.current) ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        if (e.key === "Escape") {
          setIsSearchOpen(false);
          searchInputRef.current?.blur();
        }
        return;
      }

      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (!carouselRef.current) return;

    isDraggingRef.current = true;
    isDragThresholdPassed.current = false;
    dragStartX.current = e.clientX;
    dragStartScrollLeft.current = carouselRef.current.scrollLeft;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !carouselRef.current) return;
    const deltaX = e.clientX - dragStartX.current;
    if (Math.abs(deltaX) > 5) {
      isDragThresholdPassed.current = true;
    }
    carouselRef.current.scrollLeft = dragStartScrollLeft.current - deltaX;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    setIsDragging(false);
    setTimeout(() => {
      isDragThresholdPassed.current = false;
    }, 50);
  };

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
  // Sembunyikan konten suggestive / 18+ dari Featured Today.
  const featuredMedia = useMemo(() => {
    const list = mediaList.filter((m) => m.contentRating !== "SUGGESTIVE_18");
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }, [mediaList]);

  // Filter list by Type, Search, Content Rating, and Release Status
  const filteredMedia = useMemo(() => {
    return mediaList.filter((m) => {
      // Search
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesTitle = m.title.toLowerCase().includes(query);
        const matchesType = m.type.toLowerCase().includes(query);
        const matchesGenres = m.genres?.some((g) => g.toLowerCase().includes(query));
        if (!matchesTitle && !matchesType && !matchesGenres) return false;
      }

      // Type filter
      if (selectedType === "MANHWA" && m.type !== "MANHWA") return false;
      if (selectedType === "MANGA" && m.type !== "MANGA") return false;

      // Content Rating filter: "Safe" vs "Suggestive / 18+"
      if (selectedRating === "SAFE" && m.contentRating === "SUGGESTIVE_18") return false;
      if (selectedRating === "SUGGESTIVE_18" && m.contentRating !== "SUGGESTIVE_18") return false;

      // Release Status filter: "Releasing" vs "Finished"
      if (selectedStatus === "RELEASING" && m.status !== "RELEASING") return false;
      if (selectedStatus === "FINISHED" && m.status !== "FINISHED") return false;

      return true;
    });
  }, [mediaList, search, selectedType, selectedRating, selectedStatus]);

  // Reset pagination when search or filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, selectedType, selectedRating, selectedStatus]);

  // Slice displayed media for performance
  const displayedMedia = useMemo(() => {
    return filteredMedia.slice(0, visibleCount);
  }, [filteredMedia, visibleCount]);

  // Extract popular genres dynamically from media catalog
  const popularGenres = useMemo(() => {
    const genreMap: Record<string, number> = {};
    for (const m of mediaList) {
      const genres = m.genres || MEDIA_META[m.title]?.genres || [];
      for (const g of genres) {
        genreMap[g] = (genreMap[g] || 0) + 1;
      }
    }
    const sorted = Object.entries(genreMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    return sorted.length > 0
      ? sorted.slice(0, 8)
      : ["Action", "Fantasy", "Murim", "Adventure", "Reincarnation", "Supernatural", "Tower", "Comedy"];
  }, [mediaList]);

  // Featured recommendation series (up to 5 series)
  const recommendedSeries = useMemo(() => {
    return mediaList.slice(0, 5);
  }, [mediaList]);

  // Dynamic search suggestions matching title / type / genre
  const searchSuggestions = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return mediaList
      .filter((m) => {
        const matchTitle = m.title.toLowerCase().includes(q);
        const matchType = m.type.toLowerCase().includes(q);
        const matchGenre = (m.genres || MEDIA_META[m.title]?.genres)?.some((g) =>
          g.toLowerCase().includes(q)
        );
        return matchTitle || matchType || matchGenre;
      })
      .slice(0, 6);
  }, [mediaList, search]);

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
            className="object-cover object-center blur-md opacity-45 scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b0f19]/80 via-[#0b0f19]/70 to-[#0b0f19]" />
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
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`flex items-stretch gap-4 overflow-x-auto no-scrollbar py-2 px-0.5 select-none touch-pan-x ${
                isDragging ? "cursor-grabbing scroll-auto" : "cursor-grab scroll-smooth"
              }`}
              style={{ scrollSnapType: isDragging ? "none" : "x mandatory" }}
            >
              {featuredMedia.map((item) => {
                const meta = MEDIA_META[item.title];
                return (
                  <Link
                    key={item.id}
                    href={`/media/${item.id}`}
                    onClick={(e) => {
                      if (isDragThresholdPassed.current) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    draggable={false}
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
                          draggable={false}
                          className="object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none"
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
        <div className="relative z-30 flex flex-col gap-6 mb-8">
          {/* Header Title with stats */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                  Exploration Hub
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Manga &amp; Manhwa Catalog
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Jelajahi alur karakter bab demi bab dengan visualisasi graf bebas spoiler
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-end">
              <span className="px-3 py-1 rounded-full text-xs font-mono font-semibold bg-white/5 border border-white/10 text-slate-300">
                {displayedMedia.length < filteredMedia.length
                  ? `${displayedMedia.length} dari ${filteredMedia.length} Series`
                  : `${filteredMedia.length} / ${mediaList.length} Series`}
              </span>
            </div>
          </div>

          {/* Broadened, Prominent Search Bar with Clear Outline */}
          <div ref={searchContainerRef} className="relative w-full">
            <div
              className={`relative flex items-center w-full h-12 sm:h-14 px-4 rounded-2xl bg-[#0f172a]/95 backdrop-blur-xl border-2 transition-all duration-200 shadow-xl ${
                isSearchOpen || isSearchFocused
                  ? "border-indigo-400 ring-4 ring-indigo-500/25 shadow-indigo-950/50"
                  : "border-indigo-500/40 hover:border-indigo-400/80 ring-1 ring-white/10 shadow-black/40"
              }`}
            >
              <SearchIcon className="w-5 h-5 text-indigo-400 shrink-0 mr-3 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Cari judul cerita, genre, atau alternatif nama... (Tekan / atau ⌘K)"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => {
                  setIsSearchFocused(true);
                  setIsSearchOpen(true);
                }}
                onBlur={() => setIsSearchFocused(false)}
                className="w-full bg-transparent text-sm sm:text-base text-white placeholder-slate-400 focus:outline-none font-medium"
              />

              {/* Clear search button */}
              {search ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    searchInputRef.current?.focus();
                  }}
                  className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer mr-2 shrink-0"
                  aria-label="Clear search"
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                    <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                  </svg>
                </button>
              ) : null}

              {/* Keyboard shortcut hint */}
              <div className="hidden sm:flex items-center gap-1 shrink-0 text-[11px] font-mono text-slate-400 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 select-none">
                <span className="font-semibold text-slate-300">⌘K</span>
                <span className="text-slate-500">/</span>
                <span className="font-semibold text-slate-300">/</span>
              </div>
            </div>

            {/* Dropdown Suggestions / Live Autocomplete */}
            {isSearchOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 p-3 bg-[#0d1424]/98 backdrop-blur-2xl rounded-2xl border-2 border-indigo-500/30 ring-1 ring-white/10 shadow-2xl shadow-black/80 z-50 animate-fade-in divide-y divide-white/10 max-h-96 overflow-y-auto">
                {search.trim() ? (
                  <div>
                    <div className="px-3 py-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <span>Hasil Pencarian Judul &amp; Genre ({searchSuggestions.length})</span>
                      <span className="text-indigo-400 font-mono font-normal">Esc untuk menutup</span>
                    </div>
                    {searchSuggestions.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        <p className="font-semibold text-slate-300">
                          Tidak ada cerita yang cocok dengan &ldquo;{search}&rdquo;
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Coba gunakan kata kunci genre seperti Action, Murim, Fantasy, atau cek ejaan nama.
                        </p>
                        <button
                          type="button"
                          onClick={() => setSearch("")}
                          className="mt-3 px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition cursor-pointer"
                        >
                          Reset Pencarian
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-white/5">
                        {searchSuggestions.map((m) => {
                          const meta = MEDIA_META[m.title];
                          const genres = m.genres || meta?.genres || [];
                          return (
                            <Link
                              key={m.id}
                              href={`/media/${m.id}`}
                              onClick={() => setIsSearchOpen(false)}
                              className="w-full px-3 py-2.5 flex items-center gap-3.5 hover:bg-indigo-500/10 rounded-xl transition-colors group cursor-pointer"
                            >
                              <div className="relative w-10 h-14 rounded-lg overflow-hidden ring-1 ring-white/10 bg-[#161f30] shrink-0">
                                <Image
                                  src={m.coverImage}
                                  alt={m.title}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30">
                                    {m.type}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {m.totalChapters} Chapters
                                  </span>
                                </div>
                                <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-indigo-300 transition-colors truncate">
                                  {m.title}
                                </h4>
                                {genres.length > 0 && (
                                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                    {genres.slice(0, 3).join(" • ")}
                                  </p>
                                )}
                              </div>
                              <span className="text-xs font-semibold text-indigo-400 group-hover:translate-x-1 transition-transform shrink-0 flex items-center gap-1">
                                Buka Peta →
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 p-2">
                    {/* Quick popular series */}
                    <div>
                      <div className="px-1 pb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <SparklesIcon className="w-3.5 h-3.5 text-indigo-400" />
                          Rekomendasi Cerita Populer
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {recommendedSeries.slice(0, 4).map((m) => (
                          <Link
                            key={m.id}
                            href={`/media/${m.id}`}
                            onClick={() => setIsSearchOpen(false)}
                            className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.02] hover:bg-indigo-500/10 border border-white/5 hover:border-indigo-500/30 transition group cursor-pointer"
                          >
                            <div className="relative w-8 h-10 rounded-md overflow-hidden ring-1 ring-white/10 shrink-0">
                              <Image
                                src={m.coverImage}
                                alt={m.title}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-white group-hover:text-indigo-300 truncate transition-colors">
                                {m.title}
                              </p>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {m.totalChapters} Ch. • {m.type}
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>

                    {/* Quick categories */}
                    <div className="pt-2 border-t border-white/5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block px-1 mb-2">
                        Kategori &amp; Genre Populer
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {popularGenres.map((genre) => (
                          <button
                            key={genre}
                            type="button"
                            onClick={() => {
                              setSearch(genre);
                              setIsSearchOpen(false);
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/5 hover:bg-indigo-500/20 hover:text-indigo-200 text-slate-300 border border-white/10 transition cursor-pointer"
                          >
                            #{genre}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Filter Bar */}
          <div className="relative z-30 flex flex-wrap items-center justify-between gap-3 p-2.5 sm:p-3 rounded-2xl bg-white/[0.02] ring-1 ring-white/10 backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              {/* Type filter dropdown */}
              <FilterDropdown
                value={selectedType}
                onChange={setSelectedType}
                ariaLabel="Filter Type"
                icon={LayersIcon}
                options={[
                  { value: "ALL", label: "All Types" },
                  { value: "MANHWA", label: "Manhwa" },
                  { value: "MANGA", label: "Manga" },
                ]}
                activeClass="bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-500/40"
                inactiveClass="bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 ring-1 ring-white/10"
                iconActiveClass="text-indigo-400"
                iconInactiveClass="text-slate-400"
              />

              {/* Status filter dropdown */}
              <FilterDropdown
                value={selectedStatus}
                onChange={setSelectedStatus}
                ariaLabel="Filter Status"
                icon={PulseIcon}
                options={[
                  { value: "ALL", label: "All Status" },
                  { value: "RELEASING", label: "Releasing" },
                  { value: "FINISHED", label: "Finished" },
                ]}
                activeClass="bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/40"
                inactiveClass="bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 ring-1 ring-white/10"
                iconActiveClass="text-sky-400"
                iconInactiveClass="text-slate-400"
              />

              {/* Content Rating filter dropdown */}
              <FilterDropdown
                value={selectedRating}
                onChange={setSelectedRating}
                ariaLabel="Filter Content Rating"
                icon={ShieldIcon}
                options={[
                  { value: "SAFE", label: "Safe Content" },
                  { value: "SUGGESTIVE_18", label: "Suggestive / 18+" },
                  { value: "ALL", label: "All Content" },
                ]}
                activeClass={
                  selectedRating === "SUGGESTIVE_18"
                    ? "bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/40"
                    : selectedRating === "ALL"
                    ? "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/40"
                    : "bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                }
                inactiveClass="bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                iconActiveClass={
                  selectedRating === "SUGGESTIVE_18"
                    ? "text-rose-400"
                    : selectedRating === "ALL"
                    ? "text-amber-400"
                    : "text-emerald-400"
                }
                iconInactiveClass="text-emerald-400"
                chevronClass={
                  selectedRating === "SUGGESTIVE_18"
                    ? "text-rose-400/70"
                    : selectedRating === "ALL"
                    ? "text-amber-400/70"
                    : "text-emerald-400/70"
                }
              />
            </div>

            {/* Reset filters if any active */}
            {(selectedType !== "ALL" || selectedStatus !== "ALL" || selectedRating !== "SAFE" || search) && (
              <button
                onClick={() => {
                  setSelectedType("ALL");
                  setSelectedStatus("ALL");
                  setSelectedRating("SAFE");
                  setSearch("");
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2.5 py-1.5 rounded-lg transition hover:bg-white/5 cursor-pointer ml-auto flex items-center gap-1.5"
              >
                <RotateCcwIcon className="w-3 h-3" />
                Reset Filters
              </button>
            )}
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
              No manga/manhwa found matching your filters
            </p>
            <button
              onClick={() => {
                setSearch("");
                setSelectedType("ALL");
                setSelectedRating("SAFE");
                setSelectedStatus("ALL");
              }}
              className="px-5 py-2.5 rounded-full bg-indigo-500/15 text-[#a5b4fc] text-xs font-semibold ring-1 ring-indigo-500/40 hover:bg-indigo-500/25 transition cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5 sm:gap-6">
              {displayedMedia.map((m) => {
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
                      <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5 max-w-[78%]">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-[#0b0f19]/85 text-[#7dd3fc] ring-1 ring-white/10 backdrop-blur-md">
                          {m.type}
                        </span>
                        {m.status === "RELEASING" ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-[#0b0f19]/85 text-sky-400 ring-1 ring-sky-500/30 backdrop-blur-md flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                            Releasing
                          </span>
                        ) : m.status === "FINISHED" ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-medium tracking-wide bg-[#0b0f19]/85 text-slate-300 ring-1 ring-white/10 backdrop-blur-md">
                            Finished
                          </span>
                        ) : null}
                        {m.contentRating === "SUGGESTIVE_18" && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide bg-rose-950/90 text-rose-300 ring-1 ring-rose-500/40 backdrop-blur-md">
                            18+
                          </span>
                        )}
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

            {/* Load More Button */}
            {filteredMedia.length > visibleCount && (
              <div className="mt-12 flex flex-col items-center justify-center gap-3">
                <p className="text-xs text-slate-400 font-medium">
                  Menampilkan <span className="text-white font-bold">{displayedMedia.length}</span> dari{" "}
                  <span className="text-white font-bold">{filteredMedia.length}</span> cerita
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
      </section>
    </div>
  );
}
