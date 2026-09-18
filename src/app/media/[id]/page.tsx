"use client";

import { useEffect, useState, useRef, use } from "react";
import Link from "next/link";
import Image from "next/image";
import GraphCanvas from "@/components/GraphCanvas";
import ChapterDropdown from "@/components/ChapterDropdown";
import CharacterSearch from "@/components/CharacterSearch";
import FloatingPanel from "@/components/FloatingPanel";
import type { GraphResponse, GraphNode } from "@/lib/types";

interface MediaHeader {
  id: string;
  title: string;
  type: string;
  coverImage: string;
  totalChapters: number;
  chapterNumberingSource: string;
}

export default function MediaGraphPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const mediaId = resolvedParams.id;

  const [media, setMedia] = useState<MediaHeader | null>(null);
  const [chapter, setChapter] = useState(1);
  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  // Persistent position cache so nodes stay put across chapter changes
  const positionCache = useRef<Map<string, { x: number; y: number }>>(new Map());

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
          if (selectedNodeId && !json.nodes.some((n) => n.id === selectedNodeId)) {
            setSelectedNodeId(null);
          }
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
  }, [mediaId, chapter, selectedNodeId]);

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
      {/* Top Header / Control Bar */}
      <header className="h-16 border-b border-[#1e293b] bg-[#111827]/90 backdrop-blur-md px-4 flex items-center justify-between gap-4 shrink-0 z-30">
        {/* Left: Back & Media Info */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/#catalog"
            className="w-9 h-9 rounded-xl bg-[#161f30] border border-[#27354f] hover:border-[#818cf8] flex items-center justify-center text-slate-300 hover:text-white transition-colors shrink-0"
            title="Back to Catalog"
          >
            ←
          </Link>

          {media && (
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-9 h-11 rounded-lg overflow-hidden border border-[#27354f] shrink-0 hidden sm:block">
                <Image
                  src={media.coverImage}
                  alt={media.title}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold text-white truncate">
                  {media.title}
                </h1>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="px-1.5 py-0.5 rounded bg-[#1e293b] text-[#a5b4fc] border border-[#334155] text-[10px] font-semibold">
                    {media.type}
                  </span>
                  <span>Source: {media.chapterNumberingSource}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Center: Chapter Dropdown */}
        <div className="flex items-center gap-2">
          {media && (
            <ChapterDropdown
              currentChapter={chapter}
              totalChapters={media.totalChapters}
              onChange={setChapter}
              disabled={loading}
            />
          )}
        </div>

        {/* Right: Character Search */}
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

      {/* Main Graph Viewport */}
      <main className="relative flex-1 w-full h-full overflow-hidden p-3 bg-[#0b0f19]">
        {loading && !data && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#0b0f19]/80 backdrop-blur-sm text-slate-300">
            <div className="w-12 h-12 border-4 border-[#334155] border-t-[#818cf8] rounded-full animate-spin mb-3" />
            <p className="text-sm font-semibold tracking-wide">Constructing zero-spoiler temporal graph...</p>
            <p className="text-xs text-slate-400 mt-1">Applying Layer 1 backend filter for Chapter {chapter}</p>
          </div>
        )}

        {data && (
          <>
            <GraphCanvas
              data={data}
              positionCache={positionCache}
              onNodeClick={(id) => {
                setSelectedNodeId(id);
                setFocusNodeId(id);
              }}
              selectedNodeId={selectedNodeId}
              focusNodeId={focusNodeId}
            />

            {/* Faction Legend Bar */}
            {data.factions.length > 0 && (
              <div className="absolute top-6 left-6 z-20 bg-[#111827]/90 backdrop-blur-md px-3 py-2 rounded-xl border border-[#1e293b] shadow-xl hidden md:flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                  Faction Columns:
                </span>
                <div className="flex items-center gap-2.5">
                  {data.factions.map((f) => (
                    <div key={f.id} className="flex items-center gap-1.5 text-xs text-slate-300">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: f.colorHex || "#818cf8" }}
                      />
                      <span>{f.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Floating Profile & Unlocked Relations Panel */}
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
