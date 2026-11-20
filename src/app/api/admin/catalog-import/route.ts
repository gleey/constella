import { NextResponse } from "next/server";
import { importCatalog, syncOngoingReleases } from "@/lib/catalog-import";

/** POST /api/admin/catalog-import — bulk-import AniList catalog metadata. */
export async function POST(request: Request) {
  let body: {
    countries?: string[];
    maxPages?: number;
    perPage?: number;
    mode?: "all" | "ongoing";
    status?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine; use defaults.
  }

  const countries =
    Array.isArray(body.countries) && body.countries.length > 0
      ? body.countries.filter((c) => typeof c === "string")
      : ["KR", "JP"];
  const maxPages =
    typeof body.maxPages === "number" && body.maxPages > 0
      ? Math.min(20, Math.floor(body.maxPages))
      : 6;
  const perPage = 50;

  try {
    let result;
    if (body.mode === "ongoing") {
      result = await syncOngoingReleases({ maxPages: Math.min(5, maxPages), countries });
    } else {
      result = await importCatalog({
        countries,
        maxPages,
        perPage,
        status: body.status,
      });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Catalog import route failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
