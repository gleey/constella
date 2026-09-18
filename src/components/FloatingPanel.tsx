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
    <div className="absolute top-4 right-4 z-40 w-96 max-h-[calc(100vh-6rem)] bg-[#111827]/95 backdrop-blur-xl border border-[#1e293b] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-slide-in-right text-slate-200">
      {/* Header with Avatar & Status */}
      <div className="relative p-5 pb-4 bg-[#111827] border-b border-[#1e293b]">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#161f30] hover:bg-[#1e293b] text-slate-400 hover:text-white flex items-center justify-center transition-colors z-10 cursor-pointer"
        >
          ✕
        </button>

        <div className="flex items-start gap-4">
          <div className="relative w-16 h-16 rounded-2xl overflow-hidden border-2 border-[#334155] shadow-lg bg-[#161f30] shrink-0">
            {node.imageUrl ? (
              <Image
                src={node.imageUrl}
                alt={node.name}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xl font-bold text-[#818cf8] bg-[#161f30]">
                {node.name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 pr-6">
            <h2 className="text-lg font-bold text-white truncate">{node.name}</h2>

            {/* Debut Chapter Badge */}
            {node.debutChapter && (
              <div className="mt-1 flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#161f30] text-[#38bdf8] border border-[#27354f]">
                  First Appeared: Chapter {node.debutChapter}
                </span>
              </div>
            )}

            {/* Status Pill */}
            {node.status && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Status:</span>
                {node.status.isSensitive ? (
                  <SpoilerToggle
                    isSensitive={true}
                    content={
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-300 border border-rose-800/60">
                        {node.status.status}
                      </span>
                    }
                    placeholder="Status Classified"
                    resetKey={chapter}
                  />
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                    {node.status.status}
                  </span>
                )}
              </div>
            )}

            {/* Primary Faction badge */}
            {primaryFaction && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: primaryFaction.colorHex || "#818cf8" }}
                />
                <span className="text-xs font-medium text-slate-300 truncate">
                  {primaryFaction.name}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Description Section */}
        <div>
          <h3 className="text-xs font-bold text-[#818cf8] uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span>Character Description</span>
            <span className="text-[10px] text-slate-400 font-normal">Ch. {chapter} Zero-Spoiler</span>
          </h3>

          <div className="bg-[#0b0f19] p-3.5 rounded-xl border border-[#1e293b] text-sm text-slate-300 leading-relaxed">
            {/* Embedded debut reference inside description box */}
            {node.debutChapter && (
              <div className="mb-2 pb-2 border-b border-[#1e293b] text-[11px] text-slate-400 flex items-center justify-between">
                <span>Story Introduction:</span>
                <span className="font-semibold text-[#38bdf8]">Chapter {node.debutChapter}</span>
              </div>
            )}

            {node.description ? (
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2 pb-1 border-b border-[#1e293b]">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Current Arc at Chapter {chapter}
                  </span>
                  {node.description.isSensitive && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-950/80 text-amber-300 border border-amber-800/60 font-mono">
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
              <p className="text-xs italic text-slate-400">No public bio available at this chapter.</p>
            )}
          </div>
        </div>

        {/* Factions Section */}
        {node.factions.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-[#818cf8] uppercase tracking-wider mb-1.5">
              Affiliations at Ch. {chapter}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {node.factions.map((nf) => {
                const fac = factionMap.get(nf.factionId);
                if (!fac) return null;
                return (
                  <span
                    key={nf.factionId}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#161f30] border border-[#27354f] text-slate-200 flex items-center gap-1.5"
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

        {/* Unlocked Relationships Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-[#818cf8] uppercase tracking-wider">
              Unlocked Relations ({relationships.length})
            </h3>
            <span className="text-[10px] text-slate-400">Known at Ch. {chapter}</span>
          </div>

          {relationships.length === 0 ? (
            <div className="p-3 bg-[#0b0f19] rounded-xl border border-[#1e293b] text-center">
              <p className="text-xs text-slate-400">No established bonds unlocked yet.</p>
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
                  <div
                    key={edge.id}
                    onClick={() => onFocusNode?.(partner.id)}
                    className="group p-2.5 bg-[#0b0f19] hover:bg-[#161f30] border border-[#1e293b] hover:border-[#818cf8]/50 rounded-xl transition-all flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative w-8 h-8 rounded-full overflow-hidden border border-[#334155] bg-[#161f30] shrink-0">
                        {partner.imageUrl ? (
                          <Image
                            src={partner.imageUrl}
                            alt={partner.name}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[#818cf8]">
                            {partner.name[0]}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white group-hover:text-[#818cf8] transition-colors truncate">
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
                        <div className="flex items-center gap-1.5 justify-end">
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#1e1b4b] border border-[#4338ca] text-[#c7d2fe]">
                            {edge.relationType}
                          </span>
                          <span className="text-[10px] text-amber-400 font-mono" title="Spoiler relation">
                            ⚠️
                          </span>
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#161f30] border border-[#27354f] text-slate-200">
                          {edge.relationType}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-[#0b0f19] border-t border-[#1e293b] text-[11px] text-slate-400 text-center flex items-center justify-between">
        <span>Click relation to center character</span>
        <span>Esc to close</span>
      </div>
    </div>
  );
}
