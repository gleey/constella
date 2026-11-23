"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import Image from "next/image";
import GraphCanvas from "@/components/GraphCanvas";
import ChapterSlider from "@/components/ChapterSlider";
import CharacterSearch from "@/components/CharacterSearch";
import FloatingPanel from "@/components/FloatingPanel";
import type { GraphResponse, GraphNode } from "@/lib/types";
import { RELATION_CATEGORIES } from "@/lib/relations";

interface MediaHeader {
  id: string;
  title: string;
  type: string;
  coverImage: string;
  totalChapters: number;
  chapterNumberingSource: string;
}

/** Plain-language labels for the internal chapter-numbering codes. */
const NUMBERING_LABELS: Record<string, string> = {
  official_en: "Official English",
  raw_kr: "Raw Korean",
  raw_jp: "Raw Japanese",
  scanlation: "Scanlation",
};

export default function MediaGraphPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const mediaId = resolvedParams.id;

  const [media, setMedia] = useState<MediaHeader | null>(null);
  const [chapter, setChapter] = useState(1);
  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  // Fetch media details
  useEffect(() => {
    async function loadMedia() {
      try {
        const res = await fetch("/api/media");
        const list: MediaHeader[] = await res.json();
        const found = list.find((m) => m.id === mediaId);
        if (found) {
          setMedia(found);
        }
      } catch (e) {
        console.error("Failed to load media info", e);
      }
    }
    loadMedia();
  }, [mediaId]);

  // Fetch graph data on chapter change
  useEffect(() => {
    let cancelled = false;
    async function fetchGraph() {
      setLoading(true);
      try {
        const res = await fetch(`/api/media/${mediaId}/graph?chapter=${chapter}`);
        if (!res.ok) throw new Error("Failed to load graph");
        const json: GraphResponse = await res.json();
        if (!cancelled) {
          setData(json);
          // If the currently selected character is not visible at new chapter, unselect
          setSelectedNodeId((prev) => (prev && !json.nodes.some((n) => n.id === prev) ? null : prev));
        }
      } catch (err) {
        console.error("Graph fetch error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchGraph();
    return () => {
      cancelled = true;
    };
  }, [mediaId, chapter]);

  // Keyboard navigation for chapters
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.key === "ArrowLeft" && chapter > 1) {
        setChapter((c) => Math.max(1, c - 1));
      } else if (e.key === "ArrowRight" && media && chapter < media.totalChapters) {
        setChapter((c) => Math.min(media.totalChapters, c + 1));
      } else if (e.key === "Escape") {
        setSelectedNodeId(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chapter, media]);

  const selectedNode: GraphNode | null =
    data?.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const handleSelectCharacterFromSearch = (characterId: string) => {
    setSelectedNodeId(characterId);
    setFocusNodeId(characterId);
  };

  const handleFocusRelated = (partnerId: string) => {
    setSelectedNodeId(partnerId);
    setFocusNodeId(partnerId);
  };

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] bg-[#0b0f19] overflow-hidden flex flex-col">
      {/* Top header / control bar */}
      <header className="h-16 border-b border-white/5 bg-[#0b0f19]/80 backdrop-blur-xl px-4 flex items-center justify-between gap-4 shrink-0 z-30">
        {/* Left: back & media info */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/#catalog"
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 ring-1 ring-white/10 hover:ring-indigo-500/50 flex items-center justify-center text-slate-300 hover:text-white transition-colors shrink-0"
            title="Back to Catalog"
            aria-label="Back to catalog"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M12 4l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>

          {media && (
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-9 h-11 rounded-lg overflow-hidden ring-1 ring-white/10 shadow-lg shadow-black/30 shrink-0 hidden sm:block">
                <Image
                  src={media.coverImage}
                  alt={media.title}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                  {media.title}
                </h1>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-[#a5b4fc] ring-1 ring-indigo-500/30 text-[10px] font-bold uppercase tracking-wide">
                    {media.type}
                  </span>
                  <span className="truncate">
                    Chapters: {NUMBERING_LABELS[media.chapterNumberingSource] ?? media.chapterNumberingSource}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Center: chapter slider */}
        <div className="flex items-center gap-2">
          {media && (
            <ChapterSlider
              currentChapter={chapter}
              totalChapters={media.totalChapters}
              onChange={setChapter}
              disabled={loading}
            />
          )}
        </div>

        {/* Right: character search */}
        <div className="flex items-center gap-2">
          {data && (
            <CharacterSearch
              nodes={data.nodes}
              factions={data.factions}
              onSelectCharacter={handleSelectCharacterFromSearch}
            />
          )}
        </div>
      </header>

      {/* Main graph viewport */}
      <main className="relative flex-1 w-full h-full overflow-hidden p-3 bg-[#0b0f19] aurora">
        {loading && !data && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#0b0f19]/80 backdrop-blur-sm text-slate-300">
            <div className="w-12 h-12 border-4 border-white/10 border-t-indigo-400 rounded-full animate-spin mb-4" />
            <p className="text-sm font-semibold tracking-wide">
              Loading character map…
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Chapter {chapter}
            </p>
          </div>
        )}

        {data && (
          <>
            <GraphCanvas
              data={data}
              onNodeClick={(id) => {
                setSelectedNodeId(id);
                setFocusNodeId(id);
              }}
              selectedNodeId={selectedNodeId}
              focusNodeId={focusNodeId}
            />

            {/* Legends: faction colours, debut-unknown marker, relation categories.
                Satu kolom kiri-atas supaya tidak bertabrakan dengan panel kanan;
                di mobile rail faksi bisa digeser horizontal. */}
            <div className="absolute top-3 left-3 sm:top-6 sm:left-6 z-20 flex flex-col items-start gap-1.5 max-w-[calc(100%-1.5rem)] sm:max-w-[min(65%,44rem)] pointer-events-none">
              {data.factions.length > 0 && (
                <div className="pointer-events-auto flex items-center gap-2 sm:gap-3 bg-[#0d1322]/90 backdrop-blur-xl px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl sm:rounded-full ring-1 ring-white/10 shadow-lg shadow-black/30 overflow-x-auto no-scrollbar max-w-full">
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wider font-bold text-slate-400 shrink-0">
                    Faction:
                  </span>
                  <div className="flex items-center gap-2 sm:gap-2.5">
                    {data.factions.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-300 shrink-0"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full ring-1 ring-white/20"
                          style={{ backgroundColor: f.colorHex || "#818cf8" }}
                        />
                        <span>{f.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                {data.nodes.some((n) => n.debutKnown === false) && (
                  <span className="pointer-events-auto flex items-center gap-1.5 bg-[#0d1322]/90 backdrop-blur-xl px-2.5 py-1 rounded-full ring-1 ring-white/10 shadow-lg shadow-black/30">
                    <span className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-slate-400" />
                    <span className="text-[9px] sm:text-[10px] uppercase tracking-wider font-bold text-slate-400">
                      Debut unknown
                    </span>
                  </span>
                )}
                {data.edges.length > 0 &&
                  RELATION_CATEGORIES.map((c) => (
                    <span
                      key={c.id}
                      className="pointer-events-auto flex items-center gap-1.5 bg-[#0d1322]/90 backdrop-blur-xl px-2.5 py-1 rounded-full ring-1 ring-white/10 shadow-lg shadow-black/30"
                    >
                      <span className="w-3.5 h-0.5 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="text-[9px] sm:text-[10px] uppercase tracking-wider font-bold text-slate-400">
                        {c.label}
                      </span>
                    </span>
                  ))}
              </div>
            </div>

            {/* Floating profile & unlocked relations panel */}
            <FloatingPanel
              node={selectedNode}
              chapter={chapter}
              allNodes={data.nodes}
              allEdges={data.edges}
              factions={data.factions}
              onClose={() => setSelectedNodeId(null)}
              onFocusNode={handleFocusRelated}
            />
          </>
        )}
      </main>
    </div>
  );
}
