import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/health — lightweight liveness + DB readiness probe. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "ok" });
  } catch (err) {
    console.error("Health check failed:", err);
    return NextResponse.json({ ok: false, db: "error" }, { status: 503 });
  }
}
