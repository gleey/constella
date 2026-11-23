"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import type { GraphNode, GraphFaction } from "@/lib/types";

interface CharacterSearchProps {
  nodes: GraphNode[];
  factions?: GraphFaction[];
  onSelectCharacter: (characterId: string) => void;
}

export default function CharacterSearch({
  nodes,
  factions = [],
  onSelectCharacter,
}: CharacterSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedFactionFilter, setSelectedFactionFilter] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const factionMap = useMemo(() => new Map(factions.map((f) => [f.id, f])), [factions]);

  // Recommended major characters (debut urut chapter; yang debut-nya tidak
  // diketahui ditaruh paling akhir, bukan disamakan dengan chapter hasil estimasi).
  const recommendedNodes = useMemo(() => {
    return [...nodes]
      .sort((a, b) => {
        if (a.debutKnown === false) return 1;
        if (b.debutKnown === false) return -1;
        return (a.debutChapter ?? 9999) - (b.debutChapter ?? 9999);
      })
      .slice(0, 6);
  }, [nodes]);

  // Filtered by search query and optional faction filter
  const filtered = useMemo(() => {
    return nodes.filter((n) => {
      if (selectedFactionFilter) {
        const hasFaction = n.factions?.some((f) => f.factionId === selectedFactionFilter);
        if (!hasFaction) return false;
      }
      if (query.trim()) {
        const q = query.toLowerCase();
        const matchesName = n.name.toLowerCase().includes(q);
        const matchesFaction = n.factions?.some((f) => {
          const fac = factionMap.get(f.factionId);
          return fac?.name.toLowerCase().includes(q);
        });
        if (!matchesName && !matchesFaction) return false;
      }
      return true;
    });
  }, [nodes, query, selectedFactionFilter, factionMap]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcut: Pressing / or Cmd+K / Ctrl+K to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        document.activeElement === inputRef.current ||
        (document.activeElement?.tagName === "INPUT" && document.activeElement !== inputRef.current) ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        if (e.key === "Escape") {
          setIsOpen(false);
          inputRef.current?.blur();
        }
        return;
      }

      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelect = (characterId: string) => {
    onSelectCharacter(characterId);
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative w-36 sm:w-64 md:w-80 lg:w-96">
      {/* Search Input Box with clear outline & prominence */}
      <div
        className={`relative flex items-center w-full h-10 px-3 rounded-xl bg-[#0f172a]/95 border-2 transition-all duration-200 shadow-md ${
          isOpen
            ? "border-indigo-400 ring-4 ring-indigo-500/25 shadow-indigo-950/40"
            : "border-indigo-500/40 hover:border-indigo-400/80 ring-1 ring-white/10"
        }`}
      >
        <svg
          className="w-4 h-4 text-indigo-400 shrink-0 mr-2 pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={`Cari ${nodes.length} karakter...`}
          className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none font-medium"
        />

        {/* Clear query button */}
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer mr-1"
            aria-label="Clear search"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}

        {/* Keyboard shortcut hint */}
        <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono font-medium text-slate-400 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 select-none shrink-0">
          /
        </kbd>
      </div>

      {/* Dropdown Suggestions & Results */}
      {isOpen && (
        <div className="absolute top-full right-0 w-[22rem] sm:w-[26rem] md:w-[28rem] max-w-[95vw] mt-2 bg-[#0d1322]/98 backdrop-blur-2xl ring-1 ring-white/15 border-2 border-indigo-500/30 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden z-50 max-h-96 overflow-y-auto animate-fade-in divide-y divide-white/10">
          {/* Faction Recommendation Filter Chips (if any exist) */}
          {factions.length > 0 && (
            <div className="p-2.5 bg-white/[0.02]">
              <div className="flex items-center justify-between mb-1.5 px-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Filter Faksi
                </span>
                {selectedFactionFilter && (
                  <button
                    type="button"
                    onClick={() => setSelectedFactionFilter(null)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
                  >
                    Reset Faksi
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedFactionFilter(null)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                    selectedFactionFilter === null
                      ? "bg-indigo-500 text-white shadow-sm shadow-indigo-500/40"
                      : "bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
                  }`}
                >
                  Semua ({nodes.length})
                </button>
                {factions.map((f) => {
                  const count = nodes.filter((n) =>
                    n.factions?.some((fac) => fac.factionId === f.id)
                  ).length;
                  const isSelected = selectedFactionFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() =>
                        setSelectedFactionFilter(isSelected ? null : f.id)
                      }
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                        isSelected
                          ? "bg-indigo-500/30 text-indigo-200 border border-indigo-400 ring-1 ring-indigo-500/50"
                          : "bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
                      }`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: f.colorHex || "#818cf8" }}
                      />
                      <span>{f.name}</span>
                      <span className="text-slate-400 text-[9px]">({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search Results or Recommendations */}
          <div>
            {!query.trim() && !selectedFactionFilter ? (
              <div>
                <div className="px-3.5 py-2 bg-indigo-500/5 flex items-center justify-between border-b border-white/5">
                  <span className="text-[11px] font-bold text-indigo-300 flex items-center gap-1.5">
                    ⭐ Rekomendasi Karakter Utama
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Bab Awal
                  </span>
                </div>
                {recommendedNodes.map((node) => {
                  const primaryFacId =
                    node.factions?.find((f) => !f.isSensitive)?.factionId ??
                    node.factions?.[0]?.factionId;
                  const primaryFaction = primaryFacId
                    ? factionMap.get(primaryFacId)
                    : null;

                  return (
                    <button
                      key={node.id}
                      onClick={() => handleSelect(node.id)}
                      className="w-full px-3.5 py-2.5 flex items-center gap-3 hover:bg-indigo-500/10 text-left transition-colors cursor-pointer group"
                    >
                      <div className="relative w-8 h-8 rounded-full overflow-hidden ring-2 ring-white/10 bg-[#161f30] shrink-0">
                        {node.imageUrl ? (
                          <Image
                            src={node.imageUrl}
                            alt={node.name}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[#a5b4fc]">
                            {node.name[0]}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors truncate">
                          {node.name}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          {primaryFaction && (
                            <span className="flex items-center gap-1 truncate">
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{
                                  backgroundColor: primaryFaction.colorHex || "#818cf8",
                                }}
                              />
                              {primaryFaction.name}
                            </span>
                          )}
                          {node.debutKnown === false ? (
                            <span className="text-slate-400 font-mono">Debut ?</span>
                          ) : (
                            node.debutChapter && (
                              <span className="text-sky-300 font-mono">
                                Ch. {node.debutChapter}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-indigo-400 group-hover:translate-x-0.5 transition-transform shrink-0">
                        Fokus 🎯
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                <p className="font-semibold text-slate-300">
                  Tidak ada karakter yang cocok dengan &ldquo;{query}&rdquo;
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Karakter mungkin belum muncul di bab ini atau nama berbeda.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setSelectedFactionFilter(null);
                  }}
                  className="mt-3 inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition cursor-pointer"
                >
                  Tampilkan Semua Karakter
                </button>
              </div>
            ) : (
              <div>
                <div className="px-3.5 py-1.5 bg-white/[0.02] text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-white/5 flex justify-between items-center">
                  <span>Ditemukan {filtered.length} Karakter</span>
                  {query && (
                    <span className="text-indigo-400 font-mono">
                      Query: &ldquo;{query}&rdquo;
                    </span>
                  )}
                </div>
                {filtered.map((node) => {
                  const primaryFacId =
                    node.factions?.find((f) => !f.isSensitive)?.factionId ??
                    node.factions?.[0]?.factionId;
                  const primaryFaction = primaryFacId
                    ? factionMap.get(primaryFacId)
                    : null;

                  return (
                    <button
                      key={node.id}
                      onClick={() => handleSelect(node.id)}
                      className="w-full px-3.5 py-2.5 flex items-center gap-3 hover:bg-indigo-500/10 text-left transition-colors cursor-pointer group"
                    >
                      <div className="relative w-8 h-8 rounded-full overflow-hidden ring-2 ring-white/10 bg-[#161f30] shrink-0">
                        {node.imageUrl ? (
                          <Image
                            src={node.imageUrl}
                            alt={node.name}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[#a5b4fc]">
                            {node.name[0]}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors truncate">
                          {node.name}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          {primaryFaction && (
                            <span className="flex items-center gap-1 truncate">
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{
                                  backgroundColor: primaryFaction.colorHex || "#818cf8",
                                }}
                              />
                              {primaryFaction.name}
                            </span>
                          )}
                          {node.debutKnown === false ? (
                            <span className="text-slate-400 font-mono">Debut ?</span>
                          ) : (
                            node.debutChapter && (
                              <span className="text-sky-300 font-mono">
                                Debut Ch. {node.debutChapter}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        Fokus 🎯
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
