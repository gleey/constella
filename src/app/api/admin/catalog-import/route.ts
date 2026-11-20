import { NextResponse } from "next/server";
import { importCatalog } from "@/lib/catalog-import";

/** POST /api/admin/catalog-import — bulk-import AniList catalog metadata. */
export async function POST(request: Request) {
  let body: { countries?: string[]; maxPages?: number; perPage?: number } = {};
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
    const result = await importCatalog({ countries, maxPages, perPage });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Catalog import route failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
