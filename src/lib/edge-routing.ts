/**
 * Relation line routing.
 *
 * Only edges whose straight line would pass through another character node get
 * bent; a clean relation stays straight so the graph does not turn into a bow
 * tangle. The bend is aimed away from the blocking node(s) and mirrored per
 * direction so A→B and B→A split apart.
 */

export type Point = { x: number; y: number };

/** Node half-size + border + breathing room, in graph units. */
export const NODE_CLEARANCE = 34;

export function edgeBend(
  source: string,
  target: string,
  positions: Map<string, Point>,
): number {
  const a = positions.get(source);
  const b = positions.get(target);
  if (!a || !b) return 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return 0;
  const nx = -dy / len;
  const ny = dx / len;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;

  let blocked = false;
  let sideSum = 0;
  for (const [id, p] of positions) {
    if (id === source || id === target) continue;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len)));
    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    if (Math.hypot(p.x - cx, p.y - cy) > NODE_CLEARANCE) continue;
    blocked = true;
    sideSum += Math.sign((p.x - mx) * nx + (p.y - my) * ny);
  }
  if (!blocked) return 0;

  const mag = Math.max(60, Math.min(140, len * 0.25));
  if (sideSum !== 0) return -Math.sign(sideSum) * mag;

  // Blockers on both sides: fall back to a stable per-pair sign so the two
  // directions of the same pair still separate.
  let h = 0;
  const pairKey = [source, target].sort().join("|");
  for (let i = 0; i < pairKey.length; i++) h = (h * 31 + pairKey.charCodeAt(i)) | 0;
  const pairSign = (h & 1) === 0 ? 1 : -1;
  const dirSign = source > target ? 1 : -1;
  return pairSign * dirSign * mag;
}
