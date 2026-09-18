/**
 * POST /api/admin/drafts/[id]/resolve
 *
 * Body: { resolutions: [{ name: string, action: "map" | "create" | "discard", characterId?: string, newCharacter?: { name, imageUrl, introducedAtChapter } }] }
 *
 * Handles unresolved names per PRD 4.C step 4:
 * - map: map name to existing character, add to aliases
 * - create: create new character, add name resolution
 * - discard: remove the relationship/faction entry from parsedJson
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { GeminiParsedCharacter } from "@/lib/gemini";

type RouteContext = { params: Promise<{ id: string }> };

interface Resolution {
  name: string;
  action: "map" | "create" | "discard";
  characterId?: string;
  newCharacter?: { name: string; imageUrl: string; introducedAtChapter: number };
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const draft = await prisma.draftIngestion.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (draft.reviewedAt) {
    return NextResponse.json({ error: "Draft already reviewed" }, { status: 409 });
  }

  const body = await req.json();
  const resolutions: Resolution[] = body.resolutions;

  if (!resolutions?.length) {
    return NextResponse.json({ error: "resolutions array required" }, { status: 400 });
  }

  const parsed = draft.parsedJson as unknown as GeminiParsedCharacter;
  const remainingUnresolved = [...draft.unresolvedNames];

  for (const r of resolutions) {
    const idx = remainingUnresolved.indexOf(r.name);
    if (idx === -1) {
      return NextResponse.json({ error: `Name "${r.name}" not in unresolvedNames` }, { status: 400 });
    }

    switch (r.action) {
      case "map": {
        if (!r.characterId) {
          return NextResponse.json({ error: `characterId required for map action on "${r.name}"` }, { status: 400 });
        }
        // Add name to character's aliases
        const char = await prisma.character.findUnique({ where: { id: r.characterId } });
        if (!char) {
          return NextResponse.json({ error: `Character ${r.characterId} not found` }, { status: 404 });
        }
        if (!char.aliases.includes(r.name)) {
          await prisma.character.update({
            where: { id: r.characterId },
            data: { aliases: [...char.aliases, r.name] },
          });
        }
        remainingUnresolved.splice(idx, 1);
        break;
      }

      case "create": {
        if (!r.newCharacter) {
          return NextResponse.json({ error: `newCharacter required for create action on "${r.name}"` }, { status: 400 });
        }
        await prisma.character.create({
          data: {
            mediaId: draft.mediaId,
            name: r.newCharacter.name,
            aliases: [r.name],
            imageUrl: r.newCharacter.imageUrl,
            introducedAtChapter: r.newCharacter.introducedAtChapter,
          },
        });
        remainingUnresolved.splice(idx, 1);
        break;
      }

      case "discard": {
        // Remove entries referencing this name from parsedJson
        parsed.relationships = parsed.relationships.filter((rel) => rel.targetName !== r.name);
        parsed.factions = parsed.factions.filter((f) => f.factionName !== r.name);
        remainingUnresolved.splice(idx, 1);
        break;
      }
    }
  }

  const newStatus = remainingUnresolved.length > 0 ? "UNRESOLVED" : "PENDING";

  const updated = await prisma.draftIngestion.update({
    where: { id },
    data: {
      unresolvedNames: remainingUnresolved,
      parsedJson: parsed as object,
      status: newStatus,
    },
  });

  return NextResponse.json(updated);
}
