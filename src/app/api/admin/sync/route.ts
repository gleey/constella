import { NextRequest, NextResponse } from "next/server";
import { syncPopularMedia } from "@/lib/auto-sync";
import { startCatalogSync, startLoreSync, getBackgroundSyncStatus } from "@/lib/background-sync";
import { cacheStats } from "@/lib/api-cache";

export async function GET() {
  const status = getBackgroundSyncStatus();
  const cache = cacheStats();
  return NextResponse.json({ ...status, cache });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "catalog";

    if (mode === "instant") {
      const results = await syncPopularMedia();
      return NextResponse.json({ success: true, mode: "instant", results });
    }

    if (mode === "lore") {
      // Tier 2: AI-powered lore extraction (CONSUMES TOKENS)
      const result = startLoreSync(body.anilistId ? Number(body.anilistId) : undefined);
      return NextResponse.json({
        success: true,
        mode: "lore",
        warning: "Mode ini memakan token AI (Gemini/Groq).",
        ...result,
        status: getBackgroundSyncStatus(),
      });
    }

    // Default: Tier 1 catalog sync (NO AI, cached)
    const result = startCatalogSync(body.anilistId ? Number(body.anilistId) : undefined);
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
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
