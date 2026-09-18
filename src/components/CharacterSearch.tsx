"use client";

import { useState, useRef, useEffect } from "react";
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
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const factionMap = new Map(factions.map((f) => [f.id, f]));

  const filtered = query.trim()
    ? nodes.filter((n) =>
        n.name.toLowerCase().includes(query.toLowerCase()),
      )
    : [];

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

  return (
    <div ref={containerRef} className="relative w-64 md:w-80">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={`Search ${nodes.length} characters...`}
          className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all shadow-inner"
        />
        <svg
          className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
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
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && query.trim() && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900/95 backdrop-blur-xl border border-slate-700/90 rounded-xl shadow-2xl overflow-hidden z-50 max-h-72 overflow-y-auto animate-fade-in divide-y divide-slate-800">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">
              No characters found matching &ldquo;{query}&rdquo; at this chapter
            </div>
          ) : (
            filtered.map((node) => {
              const primaryFacId =
                node.factions?.find((f) => !f.isSensitive)?.factionId ??
                node.factions?.[0]?.factionId;
              const primaryFaction = primaryFacId
                ? factionMap.get(primaryFacId)
                : null;

              return (
                <button
                  key={node.id}
                  onClick={() => {
                    onSelectCharacter(node.id);
                    setIsOpen(false);
                    setQuery("");
                  }}
                  className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-purple-950/40 text-left transition-colors cursor-pointer group"
                >
                  <div className="relative w-8 h-8 rounded-full overflow-hidden border border-purple-500/40 bg-slate-800 shrink-0">
                    {node.imageUrl ? (
                      <Image
                        src={node.imageUrl}
                        alt={node.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-purple-300">
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
                        <span className="truncate">{primaryFaction.name}</span>
                      )}
                      {node.debutChapter && (
                        <span className="text-sky-300 font-mono">
                          Ch. {node.debutChapter}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Locate →
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
