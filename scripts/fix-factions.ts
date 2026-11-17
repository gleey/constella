/**
 * One-off cleanup script:
 *  1. Dedupe FactionMembership rows (identical factionId+characterId+validFrom).
 *  2. Backfill faction.colorHex using a deterministic palette hash.
 *
 * Usage: npx tsx -r dotenv/config scripts/fix-factions.ts
 */

import { prisma } from "../src/lib/prisma";

const FACTION_COLORS = [
  "#38bdf8", "#f472b6", "#34d399", "#fbbf24", "#a78bfa",
  "#fb7185", "#4ade80", "#f97316", "#22d3ee", "#c084fc",
  "#facc15", "#2dd4bf", "#60a5fa", "#e879f9", "#fda4af",
];

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

async function main() {
  // 1. Dedupe memberships
  const dupes: { factionId: string; characterId: string; validFrom: number; c: number }[] =
    await prisma.$queryRawUnsafe(
      `SELECT "factionId", "characterId", "validFrom", count(*)::int as c
       FROM "FactionMembership"
       GROUP BY 1, 2, 3
       HAVING count(*) > 1`
    );
  console.log(`[MEMBERSHIP] ${dupes.length} grup duplikat ditemukan.`);
  for (const d of dupes) {
    const rows = await prisma.factionMembership.findMany({
      where: { factionId: d.factionId, characterId: d.characterId, validFrom: d.validFrom },
      orderBy: { isSensitive: "desc" },
    });
    const keep = rows[0];
    const drop = rows.slice(1);
    const del = await prisma.factionMembership.deleteMany({
      where: { id: { in: drop.map((r) => r.id) } },
    });
    console.log(`  → hapus ${del.count} duplikat (pertahankan ${keep.id})`);
  }

  // 2. Backfill colorHex
  const factions = await prisma.faction.findMany({ where: { colorHex: null } });
  console.log(`[FACTION] ${factions.length} fraksi tanpa warna.`);
  for (const f of factions) {
    const color = FACTION_COLORS[hashString(`${f.mediaId}:${f.name}`) % FACTION_COLORS.length];
    await prisma.faction.update({ where: { id: f.id }, data: { colorHex: color } });
  }
  console.log("[FACTION] colorHex di-backfill.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
