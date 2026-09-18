"use client";

import { useEffect, useRef, useCallback } from "react";
import cytoscape, { type Core, type NodeSingular } from "cytoscape";
import type { GraphResponse, GraphFaction, GraphNode } from "@/lib/types";

interface Props {
  data: GraphResponse;
  /** Map of nodeId → {x,y} from previous render. Mutated in-place. */
  positionCache: React.MutableRefObject<Map<string, { x: number; y: number }>>;
  onNodeClick: (nodeId: string) => void;
  selectedNodeId?: string | null;
  focusNodeId?: string | null;
}

const UNAFFILIATED_ID = "__unaffiliated__";

const KNOWN_PROTAGONISTS = [
  "sung jinwoo",
  "jinwoo",
  "kim dokja",
  "dokja",
  "arthur leywin",
  "arthur",
  "jaehwan",
  "baam",
  "twenty-fifth baam",
  "shin youngwoo",
  "grid",
  "kang jinhyuk",
  "vikir",
  "vikir van baskerville",
  "oh kangwoo",
  "kangwoo",
  "ed rothtaylor",
  "mok gyeong-un",
  "bjorn yandel",
];

/** Identify the main character from the active nodes. */
function findMainCharacterId(nodes: GraphNode[], edges: GraphResponse["edges"]): string | null {
  if (nodes.length === 0) return null;
  for (const node of nodes) {
    const lower = node.name.toLowerCase();
    if (KNOWN_PROTAGONISTS.some((p) => lower.includes(p))) {
      return node.id;
    }
  }
  const degreeMap = new Map<string, number>();
  for (const e of edges) {
    degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1);
    degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1);
  }
  const sorted = [...nodes].sort((a, b) => {
    const dA = a.debutChapter ?? 1;
    const dB = b.debutChapter ?? 1;
    if (dA !== dB) return dA - dB;
    const degA = degreeMap.get(a.id) || 0;
    const degB = degreeMap.get(b.id) || 0;
    return degB - degA;
  });
  return sorted[0].id;
}

/** Build a color lookup: factionId → colorHex (soft fallback). */
function factionColorMap(factions: GraphFaction[]) {
  const m = new Map<string, string>();
  for (const f of factions) m.set(f.id, f.colorHex ?? "#818cf8");
  m.set(UNAFFILIATED_ID, "#64748b");
  return m;
}

/** Get primary faction ID for a character node. */
function getPrimaryFactionId(node: GraphNode): string {
  const visible = node.factions?.find((f) => !f.isSensitive);
  const pick = visible ?? node.factions?.[0];
  return pick?.factionId ?? UNAFFILIATED_ID;
}

export default function GraphCanvas({
  data,
  positionCache,
  onNodeClick,
  selectedNodeId,
  focusNodeId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  // Save character node positions before unmount / re-render
  const savePositions = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes("[?isCharacter]").forEach((n: NodeSingular) => {
      const pos = n.position();
      positionCache.current.set(n.id(), { x: pos.x, y: pos.y });
    });
  }, [positionCache]);

  // Handle focusNodeId changes (e.g. from search bar or related click)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !focusNodeId) return;

    const target = cy.getElementById(focusNodeId);
    if (target && target.length > 0) {
      cy.animate({
        center: { eles: target },
        zoom: 1.3,
        duration: 500,
        easing: "ease-out-cubic",
      });
      target.addClass("highlighted");
      setTimeout(() => {
        target.removeClass("highlighted");
      }, 1500);
    }
  }, [focusNodeId]);

  // Highlight selected node
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.nodes().removeClass("selected");
    if (selectedNodeId) {
      const target = cy.getElementById(selectedNodeId);
      if (target && target.length > 0) {
        target.addClass("selected");
      }
    }
  }, [selectedNodeId]);

  useEffect(() => {
    if (!containerRef.current) return;

    const colorMap = factionColorMap(data.factions);
    const mainCharId = findMainCharacterId(data.nodes, data.edges);

    // ── 1. Group characters by faction (excluding MC from faction bubbles to preserve center placement) ──
    const factionMembers = new Map<string, GraphNode[]>();

    for (const f of data.factions) {
      factionMembers.set(f.id, []);
    }
    factionMembers.set(UNAFFILIATED_ID, []);

    let mcNode: GraphNode | null = null;

    for (const node of data.nodes) {
      if (node.id === mainCharId) {
        mcNode = node;
        continue; // MC is placed at global center (0, 0)
      }
      const pId = getPrimaryFactionId(node);
      const targetId = factionMembers.has(pId) ? pId : UNAFFILIATED_ID;
      factionMembers.get(targetId)!.push(node);
    }

    // Only keep factions that actually have non-MC members at chapter N
    const activeFactionIds = Array.from(factionMembers.keys()).filter(
      (id) => (factionMembers.get(id)?.length ?? 0) > 0,
    );

    activeFactionIds.sort((a, b) => {
      if (a === UNAFFILIATED_ID) return 1;
      if (b === UNAFFILIATED_ID) return -1;
      const fA = data.factions.find((f) => f.id === a);
      const fB = data.factions.find((f) => f.id === b);
      return (fA?.name ?? "").localeCompare(fB?.name ?? "");
    });

    const elements: cytoscape.ElementDefinition[] = [];

    // ── 2. Position Main Character at Exact Center (0, 0) ───────────────
    if (mcNode) {
      const mcFactionId = getPrimaryFactionId(mcNode);
      const mcColor = colorMap.get(mcFactionId) ?? "#818cf8";

      // Always fix MC at (0, 0) for pristine radial spokes
      positionCache.current.set(mcNode.id, { x: 0, y: 0 });

      elements.push({
        group: "nodes",
        data: {
          id: mcNode.id,
          label: mcNode.name, // Only name on canvas (PRD requirement)
          color: mcColor,
          imageUrl: mcNode.imageUrl || "",
          isCharacter: true,
          isMainCharacter: true,
        },
        position: { x: 0, y: 0 },
      });
    }

    // ── 3. Radial Orbit for Faction Clusters around (0, 0) ───────────────
    const K = activeFactionIds.length;
    // Radial distance from center MC to faction clusters
    const ORBIT_RADIUS = Math.max(400, K * 75);

    activeFactionIds.forEach((facId, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(1, K) - Math.PI / 2;
      const clusterCenterX = Math.round(ORBIT_RADIUS * Math.cos(angle));
      const clusterCenterY = Math.round(ORBIT_RADIUS * Math.sin(angle));

      const fMeta = data.factions.find((f) => f.id === facId);
      const fName =
        facId === UNAFFILIATED_ID
          ? "Independent"
          : fMeta?.name ?? "Faction";
      const fColor = colorMap.get(facId) ?? "#818cf8";

      // Circular / Rounded Faction Compound Parent Bubble
      elements.push({
        group: "nodes",
        data: {
          id: `bubble_${facId}`,
          label: fName.toUpperCase(),
          color: fColor,
          isFactionBubble: true,
        },
      });

      const members = factionMembers.get(facId) ?? [];
      // Sort members deterministically
      members.sort((a, b) => {
        const dA = a.debutChapter ?? 1;
        const dB = b.debutChapter ?? 1;
        if (dA !== dB) return dA - dB;
        return a.name.localeCompare(b.name);
      });

      const memberCount = members.length;
      const internalRadius = memberCount > 1 ? Math.min(120, 45 + memberCount * 14) : 0;

      members.forEach((node, mIdx) => {
        let posX = clusterCenterX;
        let posY = clusterCenterY;

        if (memberCount > 1) {
          const mAngle = (2 * Math.PI * mIdx) / memberCount - Math.PI / 2;
          posX = Math.round(clusterCenterX + internalRadius * Math.cos(mAngle));
          posY = Math.round(clusterCenterY + internalRadius * Math.sin(mAngle));
        }

        // Check if previously cached position exists
        const cached = positionCache.current.get(node.id);
        if (cached) {
          // If cached position is within reasonable vicinity of this cluster, retain it
          const distSq = (cached.x - clusterCenterX) ** 2 + (cached.y - clusterCenterY) ** 2;
          if (distSq < (internalRadius + 180) ** 2) {
            posX = cached.x;
            posY = cached.y;
          }
        }

        positionCache.current.set(node.id, { x: posX, y: posY });

        elements.push({
          group: "nodes",
          data: {
            id: node.id,
            parent: `bubble_${facId}`,
            label: node.name, // Only character name on canvas (PRD requirement)
            primaryFactionId: facId,
            color: fColor,
            imageUrl: node.imageUrl || "",
            isCharacter: true,
            isMainCharacter: false,
          },
          position: { x: posX, y: posY },
        });
      });
    });

    // ── 4. Add Relationship Edges ─────────────────────────────────────────
    for (const edge of data.edges) {
      elements.push({
        group: "edges",
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.relationType,
          sensitive: edge.isSensitive,
        },
      });
    }

    // Destroy previous instance
    if (cyRef.current) {
      savePositions();
      cyRef.current.destroy();
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        // Faction compound circular/rounded bubble
        {
          selector: "node[?isFactionBubble]",
          style: {
            "background-color": "#111827",
            "background-opacity": 0.45,
            "border-width": 2,
            "border-color": "data(color)",
            "border-style": "solid",
            shape: "roundrectangle",
            label: "data(label)",
            "text-valign": "top",
            "text-halign": "center",
            "text-margin-y": -12,
            "font-size": "11px",
            "font-weight": "bold",
            color: "data(color)",
            "text-background-color": "#0b0f19",
            "text-background-opacity": 0.92,
            "text-background-padding": "4px",
            "text-background-shape": "roundrectangle",
            padding: "36px 28px 24px 28px",
          },
        },
        // Character nodes
        {
          selector: "node[?isCharacter]",
          style: {
            "background-color": "#1e293b",
            "background-image": "data(imageUrl)",
            "background-fit": "cover",
            "background-clip": "node",
            shape: "ellipse",
            label: "data(label)",
            color: "#f8fafc",
            "font-size": "11px",
            "font-weight": "bold",
            "text-valign": "bottom",
            "text-margin-y": 6,
            "text-wrap": "wrap",
            "text-max-width": "110px",
            width: 52,
            height: 52,
            "border-width": 3,
            "border-color": "data(color)",
            "text-background-color": "#090d16",
            "text-background-opacity": 0.9,
            "text-background-padding": "3px",
            "text-background-shape": "roundrectangle",
            "text-border-opacity": 0.4,
            "text-border-width": 1,
            "text-border-color": "data(color)",
          },
        },
        // Main Character node special highlight
        {
          selector: "node[?isMainCharacter]",
          style: {
            width: 62,
            height: 62,
            "border-width": 4,
            "border-color": "#fbbf24", // Golden halo for Protagonist
            "underlay-color": "#fbbf24",
            "underlay-padding": 8,
            "underlay-opacity": 0.25,
            "font-size": "12px",
            "font-weight": "bold",
          },
        },
        {
          selector: "node.selected",
          style: {
            width: 60,
            height: 60,
            "border-width": 4,
            "border-color": "#38bdf8",
            "underlay-color": "#38bdf8",
            "underlay-padding": 6,
            "underlay-opacity": 0.35,
            color: "#38bdf8",
          },
        },
        {
          selector: "node.highlighted",
          style: {
            width: 64,
            height: 64,
            "border-width": 5,
            "border-color": "#f59e0b",
            "underlay-color": "#f59e0b",
            "underlay-padding": 8,
            "underlay-opacity": 0.45,
          },
        },
        // Relationship edges
        {
          selector: "edge",
          style: {
            width: 2.2,
            "line-color": "#475569",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": "9.5px",
            "font-weight": 600,
            color: "#cbd5e1",
            "text-background-color": "#090d16",
            "text-background-opacity": 0.9,
            "text-background-padding": "2px",
            "text-background-shape": "roundrectangle",
            "text-rotation": "autorotate",
            "target-arrow-shape": "triangle",
            "target-arrow-color": "#475569",
            "arrow-scale": 0.8,
          },
        },
        {
          selector: "edge[?sensitive]",
          style: {
            "line-style": "dashed",
            "line-dash-pattern": [6, 4],
            "line-color": "#64748b",
            "target-arrow-color": "#64748b",
            color: "#94a3b8",
          },
        },
        {
          selector: "edge:selected",
          style: {
            width: 3.5,
            "line-color": "#818cf8",
            "target-arrow-color": "#818cf8",
            color: "#c7d2fe",
          },
        },
      ],
      layout: { name: "preset" },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      minZoom: 0.15,
      maxZoom: 2.5,
    });

    // ── 5. Default Zoom Out & Centered on Protagonist ─────────────────────
    cy.fit(undefined, 80);
    const calculatedZoom = cy.zoom();
    // Default zoom out ~25% so the radial galaxy breathes comfortably
    cy.zoom(calculatedZoom * 0.75);
    cy.center();

    // ── 6. Events ────────────────────────────────────────────────────────
    cy.on("tap", "node[?isCharacter]", (evt) => {
      onNodeClick(evt.target.id());
    });

    cyRef.current = cy;

    return () => {
      savePositions();
    };
  }, [data, positionCache, onNodeClick, savePositions]);

  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.25);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
  const handleFit = () => {
    if (!cyRef.current) return;
    cyRef.current.fit(undefined, 80);
    cyRef.current.zoom(cyRef.current.zoom() * 0.75);
    cyRef.current.center();
  };

  return (
    <div className="relative w-full h-full min-h-[550px] overflow-hidden rounded-2xl border border-[#1e293b] bg-[#090d16] shadow-2xl">
      {/* Cytoscape DOM container */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Floating Canvas Controls */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 bg-[#111827]/90 backdrop-blur-md p-1.5 rounded-xl border border-[#1e293b] shadow-xl">
        <button
          onClick={handleZoomIn}
          title="Zoom In"
          className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#161f30] hover:bg-[#1e293b] text-slate-200 text-sm font-bold transition-colors cursor-pointer"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          title="Zoom Out"
          className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#161f30] hover:bg-[#1e293b] text-slate-200 text-sm font-bold transition-colors cursor-pointer"
        >
          -
        </button>
        <div className="w-px h-5 bg-[#334155] mx-1" />
        <button
          onClick={handleFit}
          title="Recenter & Overview"
          className="px-2.5 h-8 rounded-lg flex items-center justify-center bg-[#161f30] hover:bg-[#1e293b] text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
        >
          Overview
        </button>
      </div>

      {/* Canvas Hint */}
      <div className="absolute bottom-4 right-4 z-10 pointer-events-none hidden sm:block">
        <span className="text-[11px] text-slate-400 bg-[#0b0f19]/90 px-3 py-1.5 rounded-full border border-[#1e293b]">
          Main Character centered • Circular faction clusters • Click character for unlocked bio
        </span>
      </div>
    </div>
  );
}
