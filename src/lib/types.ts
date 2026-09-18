/** Shared types matching the API response contract (PRD 4.D). */

export interface GraphFaction {
  id: string;
  name: string;
  colorHex: string | null;
}

export interface GraphNodeStatus {
  status: string;
  isSensitive: boolean;
}

export interface GraphNodeDescription {
  text: string;
  isSensitive: boolean;
}

export interface GraphNodeFaction {
  factionId: string;
  isSensitive: boolean;
}

export interface GraphNode {
  id: string;
  name: string;
  imageUrl: string;
  debutChapter?: number;
  status: GraphNodeStatus | null;
  description: GraphNodeDescription | null;
  factions: GraphNodeFaction[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationType: string;
  isSensitive: boolean;
}

export interface GraphResponse {
  mediaId: string;
  chapter: number;
  totalChapters: number;
  factions: GraphFaction[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}
