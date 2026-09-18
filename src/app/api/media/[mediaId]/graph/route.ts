import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  temporalFilter,
  temporalOrderBy,
  characterVisibleAt,
  factionVisibleAt,
} from "@/lib/temporal";

/**
 * GET /api/media/[mediaId]/graph?chapter=N
 *
 * Returns the spoiler-free graph payload per PRD 4.D.
 * Layer 1: hard chapter filter (zero-leakage).
 * Layer 2: isSensitive flag passed through for UI.
 * No temporal metadata (validFrom/validUntil/introducedAtChapter) in response.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  const { mediaId } = await params;
  const chapterParam = req.nextUrl.searchParams.get("chapter");

  if (!chapterParam || isNaN(Number(chapterParam))) {
    return NextResponse.json(
      { error: "Query parameter 'chapter' (integer) is required." },
      { status: 400 },
    );
  }

  const chapter = parseInt(chapterParam, 10);

  // Validate media exists
  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: { id: true, totalChapters: true },
  });

  if (!media) {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }

  if (chapter < 1 || chapter > media.totalChapters) {
    return NextResponse.json(
      { error: `Chapter must be between 1 and ${media.totalChapters}.` },
      { status: 400 },
    );
  }

  // ── Layer 1: Factions visible at chapter N ───────────────────────────
  const factions = await prisma.faction.findMany({
    where: { mediaId, ...factionVisibleAt(chapter) },
    select: { id: true, name: true, colorHex: true },
  });

  const factionIds = new Set(factions.map((f) => f.id));

  // ── Layer 1: Characters visible at chapter N ─────────────────────────
  const characters = await prisma.character.findMany({
    where: { mediaId, ...characterVisibleAt(chapter) },
    select: { id: true, name: true, imageUrl: true, introducedAtChapter: true },
  });

  const characterIds = new Set(characters.map((c) => c.id));

  // ── Descriptions: deterministic pick per character ───────────────────
  // Fetch all matching, group by characterId, take first per ordering.
  const allDescs = await prisma.characterDescription.findMany({
    where: {
      characterId: { in: [...characterIds] },
      ...temporalFilter(chapter),
    },
    orderBy: temporalOrderBy,
    select: { characterId: true, text: true, isSensitive: true },
  });

  const descByChar = new Map<string, { text: string; isSensitive: boolean }>();
  for (const d of allDescs) {
    if (!descByChar.has(d.characterId)) {
      descByChar.set(d.characterId, { text: d.text, isSensitive: d.isSensitive });
    }
  }

  // ── Statuses: deterministic pick per character ───────────────────────
  const allStatuses = await prisma.characterStatus.findMany({
    where: {
      characterId: { in: [...characterIds] },
      ...temporalFilter(chapter),
    },
    orderBy: temporalOrderBy,
    select: { characterId: true, status: true, isSensitive: true },
  });

  const statusByChar = new Map<string, { status: string; isSensitive: boolean }>();
  for (const s of allStatuses) {
    if (!statusByChar.has(s.characterId)) {
      statusByChar.set(s.characterId, { status: s.status, isSensitive: s.isSensitive });
    }
  }

  // ── Faction memberships per character ────────────────────────────────
  // Only include if faction itself passed filter.
  const allMemberships = await prisma.factionMembership.findMany({
    where: {
      characterId: { in: [...characterIds] },
      factionId: { in: [...factionIds] },
      ...temporalFilter(chapter),
    },
    select: { characterId: true, factionId: true, isSensitive: true },
  });

  const membershipsByChar = new Map<string, { factionId: string; isSensitive: boolean }[]>();
  for (const m of allMemberships) {
    if (!membershipsByChar.has(m.characterId)) {
      membershipsByChar.set(m.characterId, []);
    }
    membershipsByChar.get(m.characterId)!.push({
      factionId: m.factionId,
      isSensitive: m.isSensitive,
    });
  }

  // ── Build nodes ──────────────────────────────────────────────────────
  const nodes = characters.map((c) => ({
    id: c.id,
    name: c.name,
    imageUrl: c.imageUrl,
    debutChapter: c.introducedAtChapter,
    status: statusByChar.get(c.id) ?? null,
    description: descByChar.get(c.id) ?? null,
    factions: membershipsByChar.get(c.id) ?? [],
  }));

  // ── Relationships (edges) — two-sided validation ─────────────────────
  // Both source AND target must be visible characters.
  const relationships = await prisma.relationship.findMany({
    where: {
      mediaId,
      sourceCharacterId: { in: [...characterIds] },
      targetCharacterId: { in: [...characterIds] },
      ...temporalFilter(chapter),
    },
    select: {
      id: true,
      sourceCharacterId: true,
      targetCharacterId: true,
      relationType: true,
      isSensitive: true,
    },
  });

  // Dedupe: one line per unordered pair + relation type.
  // Guards against A→B/B→A doubles so the canvas never draws 2 identical lines.
  const seenPairs = new Set<string>();
  const edges: {
    id: string;
    source: string;
    target: string;
    relationType: string;
    isSensitive: boolean;
  }[] = [];
  for (const r of relationships) {
    if (r.sourceCharacterId === r.targetCharacterId) continue; // skip self-loops
    const a = r.sourceCharacterId < r.targetCharacterId ? r.sourceCharacterId : r.targetCharacterId;
    const b = r.sourceCharacterId < r.targetCharacterId ? r.targetCharacterId : r.sourceCharacterId;
    const key = `${a}|${b}|${r.relationType}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    edges.push({
      id: r.id,
      source: r.sourceCharacterId,
      target: r.targetCharacterId,
      relationType: r.relationType,
      isSensitive: r.isSensitive,
    });
  }

  // ── Response (no temporal metadata per 4.D / 5) ─────────────────────
  return NextResponse.json({
    mediaId,
    chapter,
    totalChapters: media.totalChapters,
    factions,
    nodes,
    edges,
  });
}
