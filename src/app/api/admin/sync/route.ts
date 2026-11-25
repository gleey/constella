import { NextRequest, NextResponse } from "next/server";
import { syncPopularMedia } from "@/lib/auto-sync";
import { startCatalogSync, startLoreSync, getBackgroundSyncStatus } from "@/lib/background-sync";
import { cacheStats } from "@/lib/api-cache";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const status = getBackgroundSyncStatus();
  const cache = cacheStats();
  return NextResponse.json({ ...status, cache });
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "catalog";
    if (mode !== "catalog" && mode !== "lore" && mode !== "instant") {
      return NextResponse.json({ error: "Invalid sync mode" }, { status: 400 });
    }

    let anilistId: number | undefined;
    if (body.anilistId !== undefined && body.anilistId !== null && body.anilistId !== "") {
      const parsed = Number(body.anilistId);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return NextResponse.json({ error: "anilistId must be a positive integer" }, { status: 400 });
      }
      anilistId = parsed;
    }

    if (mode === "instant") {
      const results = await syncPopularMedia();
      return NextResponse.json({ success: true, mode: "instant", results });
    }

    if (mode === "lore") {
      // Tier 2: AI-powered lore extraction (CONSUMES TOKENS)
      const result = startLoreSync(anilistId);
      return NextResponse.json({
        success: true,
        mode: "lore",
        warning: "Mode ini memakan token AI (Gemini/Groq).",
        ...result,
        status: getBackgroundSyncStatus(),
      });
    }

    // Default: Tier 1 catalog sync (NO AI, cached)
    const result = startCatalogSync(anilistId);
    return NextResponse.json({
      success: true,
      mode: "catalog",
      info: "Catalog sync tanpa AI. Untuk lore extraction, gunakan mode=lore.",
      ...result,
      status: getBackgroundSyncStatus(),
    });
  } catch (error) {
    console.error("Sync API failed:", error);
    return NextResponse.json(
      { error: "Sync failed" },
      { status: 500 }
    );
  }
}
