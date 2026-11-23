"use client";

import Image from "next/image";
import type { GraphNode, GraphEdge, GraphFaction } from "@/lib/types";
import SpoilerToggle from "./SpoilerToggle";

interface FloatingPanelProps {
  node: GraphNode | null;
  chapter: number;
  allNodes: GraphNode[];
  allEdges: GraphEdge[];
  factions?: GraphFaction[];
  onClose: () => void;
  onFocusNode?: (nodeId: string) => void;
}

export default function FloatingPanel({
  node,
  chapter,
  allNodes,
  allEdges,
  factions = [],
  onClose,
  onFocusNode,
}: FloatingPanelProps) {
  if (!node) return null;

  const factionMap = new Map(factions.map((f) => [f.id, f]));
  const primaryFactionId =
    node.factions?.find((f) => !f.isSensitive)?.factionId ??
    node.factions?.[0]?.factionId;
  const primaryFaction = primaryFactionId ? factionMap.get(primaryFactionId) : null;
  const factionColor = primaryFaction?.colorHex || "#818cf8";

  // Find all active relationships touching this character up to chapter N
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const connectedEdges = allEdges.filter(
    (e) => e.source === node.id || e.target === node.id,
  );

  const relationships = connectedEdges
    .map((edge) => {
      const isSource = edge.source === node.id;
      const partnerId = isSource ? edge.target : edge.source;
      const partner = nodeMap.get(partnerId);
      return {
        edge,
        isSource,
        partner,
      };
    })
    .filter((r) => r.partner !== undefined);

  return (
    <div className="absolute top-4 right-4 z-40 w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-6rem)] bg-[#0d1322]/95 backdrop-blur-2xl ring-1 ring-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col animate-slide-in-right text-slate-200">
      {/* Faction accent bar */}
      <div
        className="h-0.5 w-full shrink-0"
        style={{ backgroundColor: factionColor }}
        aria-hidden
      />

      {/* Header with avatar & status */}
      <div className="relative p-5 pb-4 border-b border-white/5">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center ring-1 ring-white/10 transition-colors z-10 cursor-pointer"
          aria-label="Close panel"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>

        <div className="flex items-start gap-4">
          <div
            className="relative w-16 h-16 rounded-2xl overflow-hidden bg-[#161f30] shrink-0 shadow-lg shadow-black/40"
            style={{ boxShadow: `0 0 0 2px ${factionColor}55` }}
          >
            {node.imageUrl ? (
              <Image
                src={node.imageUrl}
                alt={node.name}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xl font-bold text-[#a5b4fc]">
                {node.name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 pr-6 space-y-1.5">
            <h2 className="text-lg font-bold text-white tracking-tight truncate">
              {node.name}
            </h2>

            {/* Debut chapter badge — "unknown" bila chapter debut belum terverifikasi */}
            {node.debutKnown === false ? (
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-500/10 text-slate-300 ring-1 ring-dashed ring-slate-500/40">
                  Debut: unknown
                </span>
              </div>
            ) : (
              node.debutChapter && (
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/25">
                    First Appeared: Chapter {node.debutChapter}
                  </span>
                </div>
              )
            )}

            {/* Status pill */}
            {node.status && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Status:</span>
                {node.status.isSensitive ? (
                  <SpoilerToggle
                    isSensitive={true}
                    content={
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/30">
                        {node.status.status}
                      </span>
                    }
                    placeholder="Status Classified"
                    resetKey={chapter}
                  />
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30">
                    {node.status.status}
                  </span>
                )}
              </div>
            )}

            {/* Primary faction badge */}
            {primaryFaction && (
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: factionColor }}
                />
                <span className="text-xs font-medium text-slate-300 truncate">
                  {primaryFaction.name}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable content body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Description section */}
        <div>
          <h3 className="text-[11px] font-bold text-[#a5b4fc] uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Character Description</span>
            <span className="text-[10px] text-slate-500 font-normal normal-case tracking-normal">
              Ch. {chapter} Zero-Spoiler
            </span>
          </h3>

          <div className="bg-[#0b0f19]/70 p-3.5 rounded-xl ring-1 ring-white/5 text-sm text-slate-300 leading-relaxed">
            {/* Embedded debut reference inside description box */}
            {node.debutKnown === false ? (
              <div className="mb-2.5 pb-2.5 border-b border-white/5 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Story Introduction:</span>
                <span className="font-semibold text-slate-400">
                  Debut unknown
                </span>
              </div>
            ) : (
              node.debutChapter && (
                <div className="mb-2.5 pb-2.5 border-b border-white/5 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Story Introduction:</span>
                  <span className="font-semibold text-sky-300">
                    Chapter {node.debutChapter}
                  </span>
                </div>
              )
            )}

            {node.description ? (
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2 pb-1.5 border-b border-white/5">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Current Arc at Chapter {chapter}
                  </span>
                  {node.description.isSensitive && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30 font-mono">
                      Spoiler Protected
                    </span>
                  )}
                </div>
                {node.description.isSensitive ? (
                  <SpoilerToggle
                    isSensitive={true}
                    content={node.description.text}
                    placeholder="[Sensitive Story Details — Click to Reveal]"
                    resetKey={chapter}
                  />
                ) : (
                  <p className="text-slate-200 leading-relaxed">{node.description.text}</p>
                )}
              </div>
            ) : (
              <p className="text-xs italic text-slate-400">
                No public bio available at this chapter.
              </p>
            )}
          </div>
        </div>

        {/* Factions section */}
        {node.factions.length > 0 && (
          <div>
            <h3 className="text-[11px] font-bold text-[#a5b4fc] uppercase tracking-wider mb-2">
              Affiliations at Ch. {chapter}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {node.factions.map((nf) => {
                const fac = factionMap.get(nf.factionId);
                if (!fac) return null;
                return (
                  <span
                    key={nf.factionId}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/5 ring-1 ring-white/10 text-slate-200 flex items-center gap-1.5"
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: fac.colorHex || "#818cf8" }}
                    />
                    {fac.name}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Unlocked relationships section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-bold text-[#a5b4fc] uppercase tracking-wider">
              Unlocked Relations ({relationships.length})
            </h3>
            <span className="text-[10px] text-slate-500">
              Known at Ch. {chapter}
            </span>
          </div>

          {relationships.length === 0 ? (
            <div className="p-4 bg-[#0b0f19]/70 rounded-xl ring-1 ring-white/5 text-center">
              <p className="text-xs text-slate-400">
                No established bonds unlocked yet.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {relationships.map(({ edge, partner }) => {
                if (!partner) return null;
                const pFacId =
                  partner.factions?.find((f) => !f.isSensitive)?.factionId ??
                  partner.factions?.[0]?.factionId;
                const pFac = pFacId ? factionMap.get(pFacId) : null;

                return (
                  <button
                    key={edge.id}
                    onClick={() => onFocusNode?.(partner.id)}
                    className="w-full group p-2.5 bg-[#0b0f19]/70 hover:bg-white/5 ring-1 ring-white/5 hover:ring-indigo-500/50 rounded-xl transition-all flex items-center justify-between gap-3 cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative w-8 h-8 rounded-full overflow-hidden ring-1 ring-white/10 bg-[#161f30] shrink-0">
                        {partner.imageUrl ? (
                          <Image
                            src={partner.imageUrl}
                            alt={partner.name}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[#a5b4fc]">
                            {partner.name[0]}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white group-hover:text-[#a5b4fc] transition-colors truncate">
                          {partner.name}
                        </p>
                        {pFac && (
                          <p className="text-[10px] text-slate-400 truncate">
                            {pFac.name}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {edge.isSensitive ? (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-500/10 ring-1 ring-indigo-500/40 text-[#c7d2fe] inline-flex items-center gap-1">
                          {edge.relationType}
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-amber-400"
                            title="Spoiler relation"
                          />
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white/5 ring-1 ring-white/10 text-slate-200">
                          {edge.relationType}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer hints */}
      <div className="px-4 py-2.5 bg-[#0b0f19]/80 border-t border-white/5 text-[10px] text-slate-500 flex items-center justify-between">
        <span>Click relation to center character</span>
        <span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/5 ring-1 ring-white/10 font-mono text-[9px] text-slate-400">
            Esc
          </kbd>{" "}
          to close
        </span>
      </div>
    </div>
  );
}
