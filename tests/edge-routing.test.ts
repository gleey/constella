/**
 * Unit checks for relation line routing (bend only when a node blocks the line).
 * Run: npx tsx tests/edge-routing.test.ts
 */
import assert from "node:assert/strict";
import { edgeBend } from "../src/lib/edge-routing";

const P = (x: number, y: number) => ({ x, y });

// Clean line, nobody between → straight.
{
  const pos = new Map([
    ["a", P(0, 0)],
    ["b", P(300, 0)],
  ]);
  assert.equal(edgeBend("a", "b", pos), 0);
}

// Node sitting on the line → bend away from it.
{
  // Blocker above the line (negative y is up in graph coords).
  const pos = new Map([
    ["a", P(0, 0)],
    ["b", P(300, 0)],
    ["c", P(150, -10)],
  ]);
  const bend = edgeBend("a", "b", pos);
  assert.notEqual(bend, 0);
  // The blocker sits above the line (negative y); the bow must go the other
  // way. With n = (-dy, dx)/len = (0, 1), that is a positive distance.
  assert.ok(bend > 0, `unexpected bend ${bend}`);
  assert.ok(Math.abs(bend) >= 60 && Math.abs(bend) <= 140);
}

// Just outside clearance → stays straight.
{
  const pos = new Map([
    ["a", P(0, 0)],
    ["b", P(300, 0)],
    ["c", P(150, -60)], // > NODE_CLEARANCE (34)
  ]);
  assert.equal(edgeBend("a", "b", pos), 0);
}

// Endpoint nodes are never treated as blockers.
{
  const pos = new Map([
    ["a", P(0, 0)],
    ["b", P(0, 40)], // tiny edge, other endpoint
  ]);
  assert.equal(edgeBend("a", "b", pos), 0);
}

// Missing position → no bend, never a crash.
assert.equal(edgeBend("a", "missing", new Map([["a", P(0, 0)]])), 0);

// Opposite directions of the same pair split apart (same magnitude, opposite sign).
{
  const pos = new Map([
    ["a", P(0, 0)],
    ["b", P(300, 0)],
    ["c", P(150, -10)],
  ]);
  const ab = edgeBend("a", "b", pos);
  const ba = edgeBend("b", "a", pos);
  assert.equal(ab, -ba);
  assert.notEqual(ab, 0);
}

// Blockers on both sides → deterministic sign, still bent.
{
  const pos = new Map([
    ["a", P(0, 0)],
    ["b", P(300, 0)],
    ["c", P(150, -10)],
    ["d", P(150, 10)],
  ]);
  const first = edgeBend("a", "b", pos);
  const second = edgeBend("a", "b", pos);
  assert.equal(first, second);
  assert.notEqual(first, 0);
}

console.log("edge-routing: all checks passed");
