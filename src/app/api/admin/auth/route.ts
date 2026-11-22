import { NextRequest, NextResponse } from "next/server";
import { signAdminCookie } from "@/lib/admin-auth";

/**
 * POST /api/admin/auth
 *
 * Exchanges the raw ADMIN_SECRET for a signed session cookie. The UI sends
 * the secret once (typed by the admin) and from then on the browser only ever
 * holds `<expiry>.<hmac>` — the raw secret is never stored in a cookie.
 *
 * This route is intentionally NOT protected by the admin middleware (the
 * middleware protects /api/admin/*, but cookie issuance is the login step).
 * It validates the secret itself.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET || process.env.ADMIN_TOKEN || "";

  if (!secret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET is not configured on the server." },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const token = String(body?.token ?? "").trim();

  if (!token || token !== secret) {
    return NextResponse.json(
      { error: "Unauthorized: invalid admin token." },
      { status: 401 },
    );
  }

  const cookieValue = signAdminCookie(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_token", cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60, // 30 days, same as the signature TTL
  });
  return res;
}
