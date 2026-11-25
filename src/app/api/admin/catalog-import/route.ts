import { NextRequest, NextResponse } from "next/server";
import { importCatalog, syncOngoingReleases } from "@/lib/catalog-import";
import { requireAdmin } from "@/lib/admin-auth";

const ALLOWED_STATUSES = new Set(["RELEASING", "FINISHED", "HIATUS", "CANCELLED", "NOT_YET_RELEASED"]);

/** POST /api/admin/catalog-import — bulk-import AniList catalog metadata. */
export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

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
      ? body.countries.filter((c): c is string => typeof c === "string" && /^[A-Z]{2}$/.test(c))
      : ["KR", "JP"];
  const maxPages =
    typeof body.maxPages === "number" && Number.isFinite(body.maxPages) && body.maxPages > 0
      ? Math.min(20, Math.floor(body.maxPages))
      : 6;
  const perPage = 50;
  const status =
    typeof body.status === "string" && ALLOWED_STATUSES.has(body.status) ? body.status : undefined;

  try {
    let result;
    if (body.mode === "ongoing") {
      result = await syncOngoingReleases({ maxPages: Math.min(5, maxPages), countries });
    } else {
      result = await importCatalog({
        countries,
        maxPages,
        perPage,
        status,
      });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Catalog import route failed:", error);
    return NextResponse.json(
      { ok: false, error: "Catalog import failed" },
      { status: 500 },
    );
  }
}
