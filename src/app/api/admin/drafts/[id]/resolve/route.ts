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
import { requireAdmin } from "@/lib/admin-auth";

type RouteContext = { params: Promise<{ id: string }> };

interface Resolution {
  name: string;
  action: "map" | "create" | "discard";
  characterId?: string;
  newCharacter?: { name: string; imageUrl: string; introducedAtChapter: number };
}

function safeImageUrl(raw: string): string {
  const trimmed = String(raw || "").trim();
  if ((trimmed.startsWith("/") && !trimmed.startsWith("//")) || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return "";
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await ctx.params;
  const draft = await prisma.draftIngestion.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (draft.reviewedAt) {
    return NextResponse.json({ error: "Draft already reviewed" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const resolutions: Resolution[] = body.resolutions;

  if (!Array.isArray(resolutions) || !resolutions.length) {
    return NextResponse.json({ error: "resolutions array required" }, { status: 400 });
  }

  const parsed = draft.parsedJson as unknown as GeminiParsedCharacter;
  const remainingUnresolved = [...draft.unresolvedNames];

  try {
    const updated = await prisma.$transaction(async (tx) => {
      for (const r of resolutions) {
        const idx = remainingUnresolved.indexOf(r.name);
        if (idx === -1) {
          throw { status: 400, message: `Name "${r.name}" not in unresolvedNames` };
        }

        switch (r.action) {
          case "map": {
            if (!r.characterId) {
              throw { status: 400, message: `characterId required for map action on "${r.name}"` };
            }
            const char = await tx.character.findUnique({ where: { id: r.characterId } });
            if (!char || char.mediaId !== draft.mediaId) {
              throw { status: 404, message: `Character ${r.characterId} not found in this media` };
            }
            if (!char.aliases.includes(r.name)) {
              await tx.character.update({
                where: { id: r.characterId },
                data: { aliases: [...char.aliases, r.name] },
              });
            }
            remainingUnresolved.splice(idx, 1);
            break;
          }

          case "create": {
            if (!r.newCharacter || !String(r.newCharacter.name || "").trim()) {
              throw { status: 400, message: `newCharacter required for create action on "${r.name}"` };
            }
            const debut = Number(r.newCharacter.introducedAtChapter);
            await tx.character.create({
              data: {
                mediaId: draft.mediaId,
                name: String(r.newCharacter.name).trim(),
                aliases: [r.name],
                imageUrl: safeImageUrl(r.newCharacter.imageUrl),
                introducedAtChapter: Number.isInteger(debut) && debut >= 1 ? debut : 1,
                debutKnown: true,
              },
            });
            remainingUnresolved.splice(idx, 1);
            break;
          }

          case "discard": {
            parsed.relationships = parsed.relationships.filter((rel) => rel.targetName !== r.name);
            parsed.factions = parsed.factions.filter((f) => f.factionName !== r.name);
            remainingUnresolved.splice(idx, 1);
            break;
          }
        }
      }

      const newStatus = remainingUnresolved.length > 0 ? "UNRESOLVED" : "PENDING";

      return tx.draftIngestion.update({
        where: { id },
        data: {
          unresolvedNames: remainingUnresolved,
          parsedJson: parsed as object,
          status: newStatus,
        },
      });
    });

    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err && "message" in err) {
      return NextResponse.json({ error: String((err as { message: unknown }).message) }, { status: Number((err as { status: unknown }).status) });
    }
    console.error("Resolve draft error:", err);
    return NextResponse.json({ error: "Failed to resolve draft" }, { status: 500 });
  }
}
