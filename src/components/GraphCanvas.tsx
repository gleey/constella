"use client";

import { useEffect, useRef, useState } from "react";
import cytoscape, { type Core } from "cytoscape";
import type { GraphResponse, GraphFaction, GraphNode } from "@/lib/types";

interface Props {
  data: GraphResponse;
  onNodeClick: (nodeId: string) => void;
  selectedNodeId?: string | null;
  focusNodeId?: string | null;
}

const UNAFFILIATED_ID = "__unaffiliated__";
const UNKNOWN_DEBUT_ID = "__unknown_debut__";
const UNKNOWN_DEBUT_LABEL_ID = "__unknown_debut_label__";

const KNOWN_PROTAGONISTS = [
  "sung jinwoo",
  "jinwoo",
  "kim dokja",
  "dokja",
  "arthur leywin",
  "jaehwan",
  "twenty-fifth bam",
  "twenty-fifth baam",
  "bam",
  "baam",
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
function findMainCharacterId(
  nodes: GraphNode[],
  edges: GraphResponse["edges"],
  protagonistId?: string | null,
): string | null {
  if (nodes.length === 0) return null;
  // Backend-resolved protagonist wins — stable for the whole series.
  if (protagonistId && nodes.some((n) => n.id === protagonistId)) return protagonistId;
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
  // Fallback: MC is usually the most connected character; earliest debut only breaks ties.
  const sorted = [...nodes].sort((a, b) => {
    const degA = degreeMap.get(a.id) || 0;
    const degB = degreeMap.get(b.id) || 0;
    if (degA !== degB) return degB - degA;
    const dA = a.debutChapter ?? 1;
    const dB = b.debutChapter ?? 1;
    return dA - dB;
  });
  return sorted[0].id;
}

/** Build a color lookup: factionId → colorHex (soft fallback). */
function factionColorMap(factions: GraphFaction[]) {
  const m = new Map<string, string>();
  for (const f of factions) m.set(f.id, f.colorHex ?? "#818cf8");
  m.set(UNAFFILIATED_ID, "#64748b");
  m.set(UNKNOWN_DEBUT_ID, "#475569");
  return m;
}

/** Fit ke karakter saja (bukan bubble faksi) dan pusatkan ke protagonist. */
function fitGraph(cy: Core, mainCharId: string | null) {
  const characters = cy.nodes("[?isCharacter]");
  if (characters.length) cy.fit(characters, 70);
  cy.zoom(Math.max(0.25, Math.min(1.15, cy.zoom())));
  const anchor = mainCharId ? cy.getElementById(mainCharId) : characters;
  if (anchor && anchor.length) cy.center(anchor);
}

/** Get primary faction ID for a character node. */
function getPrimaryFactionId(node: GraphNode): string {
  const visible = node.factions?.find((f) => !f.isSensitive);
  const pick = visible ?? node.factions?.[0];
  return pick?.factionId ?? UNAFFILIATED_ID;
}

export default function GraphCanvas({
  data,
  onNodeClick,
  selectedNodeId,
  focusNodeId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  // Simpan callback di ref supaya perubahan identitasnya (inline arrow di
  // parent) tidak menyalin ulang instance Cytoscape tiap kali node diklik —
  // yang tadinya menghapus highlight seleksi dan mereset zoom/pan.
  const onNodeClickRef = useRef(onNodeClick);
  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

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
    cy.edges().removeClass("highlighted");
    if (selectedNodeId) {
      const target = cy.getElementById(selectedNodeId);
      if (target && target.length > 0) {
        target.addClass("selected");
        // Tampilkan label relasi hanya untuk edge yang terhubung ke node dipilih.
        target.connectedEdges().addClass("highlighted");
      }
    }
  }, [selectedNodeId]);

  useEffect(() => {
    const container = containerRef.current;
    // Container must be attached to the DOM; otherwise cytoscape init
    // crashes internally (e.g. "can't access property 'value', p is null").
    if (!container || !container.isConnected) return;

    setInitError(null);
    const colorMap = factionColorMap(data.factions);
    const mainCharId = findMainCharacterId(data.nodes, data.edges, data.protagonistId);

    // ── 1. Group characters by faction (excluding MC from faction bubbles to preserve center placement) ──
    const factionMembers = new Map<string, GraphNode[]>();

    for (const f of data.factions) {
      factionMembers.set(f.id, []);
    }
    factionMembers.set(UNAFFILIATED_ID, []);
    factionMembers.set(UNKNOWN_DEBUT_ID, []);

    let mcNode: GraphNode | null = null;

    // Semua karakter dirender — tidak ada lore gate. Karakter yang debut-nya
    // belum terverifikasi dikirim ke kotak khusus "Debut unknown" (masih
    // mempunyai relasi), bukan disembunyikan.
    const visibleNodes = data.nodes;

    for (const node of visibleNodes) {
      if (node.id === mainCharId) {
        mcNode = node;
        continue; // MC is placed at global center (0, 0)
      }
      if (node.debutKnown === false) {
        factionMembers.get(UNKNOWN_DEBUT_ID)!.push(node);
        continue;
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
      if (a === UNKNOWN_DEBUT_ID) return 1;
      if (b === UNKNOWN_DEBUT_ID) return -1;
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

      elements.push({
        group: "nodes",
        data: {
          id: mcNode.id,
          label: mcNode.name, // Only name on canvas (PRD requirement)
          color: mcColor,
          hasImage: Boolean(
            mcNode.imageUrl &&
              (mcNode.imageUrl.startsWith("http://") ||
                mcNode.imageUrl.startsWith("https://") ||
                mcNode.imageUrl.startsWith("/")),
          ),
          imageUrl: mcNode.imageUrl || undefined,
          isCharacter: true,
          isMainCharacter: true,
        },
        position: { x: 0, y: 0 },
      });
    }

    // ── 3. Radial sector layout (proporsional) ───────────────────────────
    // MC tetap di tengah. Tiap faksi mendapat sektor sudut proporsional
    // dengan jumlah anggotanya: faksi besar menyebar luas, faksi kecil tetap
    // punya jatah. Anggota diurutkan berdasarkan chapter debut lalu nama,
    // lalu diletakkan di busur konsentris. Compound bubble sengaja tidak
    // dipakai — kotak pembatas membuat node saling menimpa saat sebuah faksi
    // jauh lebih besar dari yang lain. Posisi dihitung ulang tiap render.
    const MIN_SECTOR_WEIGHT = 2;
    const SECTOR_FILL = 0.84; // sisa ruang = jarak antar sektor faksi
    const FIRST_RING = 250;
    const RING_STEP = 150;
    const NODE_SPACING = 155;

    const factionWeights = activeFactionIds.map((id) =>
      Math.max(MIN_SECTOR_WEIGHT, factionMembers.get(id)?.length ?? 0),
    );
    const totalWeight = factionWeights.reduce((a, b) => a + b, 0) || 1;

    let cursorAngle = -Math.PI / 2;
    activeFactionIds.forEach((facId, facIdx) => {
      const fColor = colorMap.get(facId) ?? "#818cf8";
      const sectorSize = (2 * Math.PI * factionWeights[facIdx]) / totalWeight;
      const usable = sectorSize * SECTOR_FILL;
      const sectorStart = cursorAngle + (sectorSize - usable) / 2;
      cursorAngle += sectorSize;

      const members = [...(factionMembers.get(facId) ?? [])].sort((a, b) => {
        if (facId === UNKNOWN_DEBUT_ID) return a.name.localeCompare(b.name);
        const dA = a.debutChapter ?? 1;
        const dB = b.debutChapter ?? 1;
        if (dA !== dB) return dA - dB;
        return a.name.localeCompare(b.name);
      });

      let ring = 0;
      let slot = 0;
      for (const node of members) {
        let radius = FIRST_RING + ring * RING_STEP;
        let capacity = Math.max(
          1,
          Math.floor((radius * usable) / NODE_SPACING),
        );
        while (slot >= capacity) {
          ring += 1;
          slot = 0;
          radius = FIRST_RING + ring * RING_STEP;
          capacity = Math.max(
            1,
            Math.floor((radius * usable) / NODE_SPACING),
          );
        }

        const fraction = capacity === 1 ? 0.5 : (slot + 0.5) / capacity;
        const angle = sectorStart + usable * fraction;
        const posX = Math.round(radius * Math.cos(angle));
        const posY = Math.round(radius * Math.sin(angle));
        slot += 1;

        elements.push({
          group: "nodes",
          data: {
            id: node.id,
            label: node.name,
            primaryFactionId: facId,
            color: fColor,
            unknownDebut: facId === UNKNOWN_DEBUT_ID,
            hasImage: Boolean(
              node.imageUrl &&
                (node.imageUrl.startsWith("http://") ||
                  node.imageUrl.startsWith("https://") ||
                  node.imageUrl.startsWith("/")),
            ),
            imageUrl: node.imageUrl || undefined,
            isCharacter: true,
            isMainCharacter: false,
          },
          position: { x: posX, y: posY },
        });
      }

      // Sektor "Debut unknown" diberi label di tepi luar agar jelas bahwa
      // karakter di sini memang tidak punya data chapter debut.
      if (facId === UNKNOWN_DEBUT_ID && members.length > 0) {
        const midAngle = sectorStart + usable / 2;
        const labelRadius = FIRST_RING + ring * RING_STEP + 110;
        elements.push({
          group: "nodes",
          data: {
            id: UNKNOWN_DEBUT_LABEL_ID,
            label: "Debut unknown",
            isZoneLabel: true,
          },
          position: {
            x: Math.round(labelRadius * Math.cos(midAngle)),
            y: Math.round(labelRadius * Math.sin(midAngle)),
          },
        });
      }
    });

    // ── 4. Add Relationship Edges ─────────────────────────────────────────
    // Sanitize first: drop duplicate node ids and edges whose endpoints
    // are missing at this chapter (dangling edges crash cytoscape init).
    const seenNodeIds = new Set<string>();
    const safeElements = elements.filter((el) => {
      if (el.group === "edges") return true;
      const id = el.data.id as string;
      if (seenNodeIds.has(id)) return false;
      seenNodeIds.add(id);
      return true;
    });
    const nodeIdSet = seenNodeIds;
    for (const edge of data.edges) {
      if (!nodeIdSet.has(edge.source) || !nodeIdSet.has(edge.target)) continue;
      if (edge.source === edge.target) continue;
      safeElements.push({
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
      cyRef.current.destroy();
      cyRef.current = null;
    }

    let cy: Core;
    try {
      cy = cytoscape({
        container,
        elements: safeElements,
      style: [
        // Character nodes
        {
          selector: "node[?isCharacter]",
          style: {
            "background-color": "#1e293b",
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
        // Character nodes with valid image
        {
          selector: "node[?hasImage]",
          style: {
            "background-image": "data(imageUrl)",
            "background-fit": "cover",
            "background-clip": "node",
          },
        },
        // Debut-unknown characters: dashed grey outline so the "unknown" box
        // reads instantly, without hiding the node or its relations.
        {
          selector: "node[?unknownDebut]",
          style: {
            "border-style": "dashed",
            "border-width": 2,
            "border-color": "#64748b",
            opacity: 0.9,
          },
        },
        // Sector label for the "Debut unknown" group.
        {
          selector: "node[?isZoneLabel]",
          style: {
            label: "data(label)",
            color: "#94a3b8",
            "font-size": "11px",
            "font-style": "italic",
            "font-weight": "bold",
            "text-background-opacity": 0,
            "background-opacity": 0,
            "border-width": 0,
            width: 1,
            height: 1,
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
        // Relationship edges — label disembunyikan agar tidak menimpa node.
        // Muncul hanya saat node/edge dipilih (lihat selector di bawah).
        {
          selector: "edge",
          style: {
            width: 1.8,
            opacity: 0.7,
            "line-color": "#3f4d63",
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "target-arrow-color": "#3f4d63",
            "arrow-scale": 0.75,
          },
        },
        {
          selector: "edge[?sensitive]",
          style: {
            "line-style": "dashed",
            "line-dash-pattern": [6, 4],
            "line-color": "#4b5a72",
            "target-arrow-color": "#4b5a72",
          },
        },
        {
          selector: "edge.highlighted, edge:selected",
          style: {
            width: 3,
            opacity: 1,
            "line-color": "#818cf8",
            "target-arrow-color": "#818cf8",
            label: "data(label)",
            "font-size": "10px",
            "font-weight": 600,
            color: "#e0e7ff",
            "text-background-color": "#090d16",
            "text-background-opacity": 0.95,
            "text-background-padding": "3px",
            "text-background-shape": "roundrectangle",
            "text-rotation": "autorotate",
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

    // ── 5. Fit & center pada protagonist ──────────────────────────────────
    fitGraph(cy, mainCharId);

    // ── 6. Events ────────────────────────────────────────────────────────
    cy.on("tap", "node[?isCharacter]", (evt) => {
      onNodeClickRef.current(evt.target.id());
    });

    cyRef.current = cy;
    } catch (err) {
      console.error("Cytoscape init failed:", err);
      setInitError(err instanceof Error ? err.message : String(err));
      cyRef.current = null;
      return;
    }

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [data]);

  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.25);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
  const handleFit = () => {
    if (!cyRef.current) return;
    fitGraph(cyRef.current, findMainCharacterId(data.nodes, data.edges, data.protagonistId));
  };

  return (
    <div className="relative w-full h-full min-h-[550px] overflow-hidden rounded-2xl border border-[#1e293b] bg-[#090d16] shadow-2xl">
      {/* Cytoscape DOM container */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Cytoscape init fallback (no more full-page crash) */}
      {initError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0b0f19]/95 text-center px-6">
          <p className="text-sm font-semibold text-red-300">Graph failed to render</p>
          <p className="text-xs text-slate-400 mt-1 max-w-md">{initError}</p>
          <p className="text-xs text-slate-500 mt-2">Try changing chapter or reloading the page.</p>
        </div>
      )}

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
          Main character centered • Faction-colored sectors • Dashed grey = debut unknown • Click a node for bio & relations
        </span>
      </div>
    </div>
  );
}
