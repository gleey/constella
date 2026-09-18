"use client";

import type { GraphNode, GraphFaction } from "@/lib/types";
import SpoilerToggle from "./SpoilerToggle";

interface Props {
  node: GraphNode;
  factions: GraphFaction[];
  chapter: number;
  onClose: () => void;
}

/**
 * Modal showing character detail.
 * Separates sensitive vs non-sensitive content per PRD Tahap 2.6.
 */
export default function CharacterModal({ node, factions, chapter, onClose }: Props) {
  const factionMap = new Map(factions.map((f) => [f.id, f]));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-100">{node.name}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Status */}
        {node.status && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Status
            </h3>
            <SpoilerToggle
              content={node.status.status}
              isSensitive={node.status.isSensitive}
              resetKey={chapter}
              className="text-gray-200"
            />
          </div>
        )}

        {/* Description */}
        {node.description && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Description
            </h3>
            <SpoilerToggle
              content={node.description.text}
              isSensitive={node.description.isSensitive}
              resetKey={chapter}
              className="text-gray-300 text-sm"
            />
          </div>
        )}

        {/* Factions */}
        {node.factions.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Factions
            </h3>
            <ul className="space-y-1">
              {node.factions.map((nf) => {
                const faction = factionMap.get(nf.factionId);
                const label = faction?.name ?? "Unknown";
                return (
                  <li key={nf.factionId} className="flex items-center gap-2">
                    {faction?.colorHex && (
                      <span
                        className="w-3 h-3 rounded-full inline-block"
                        style={{ backgroundColor: faction.colorHex }}
                      />
                    )}
                    <SpoilerToggle
                      content={label}
                      isSensitive={nf.isSensitive}
                      resetKey={chapter}
                      className="text-gray-200 text-sm"
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
