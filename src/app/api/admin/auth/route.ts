import { NextRequest, NextResponse } from "next/server";
import { signAdminCookie, getAdminSecret, checkAdminAuth, safeEqualSecret } from "@/lib/admin-auth";
import { verifyAdminPassword } from "@/lib/admin-password";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/admin/auth
 *
 * Issues a signed httpOnly session cookie. Two credential forms are accepted:
 *
 *   1. Username + password (the admin login UI).
 *      Username checked against ADMIN_USERNAME (default "admin");
 *      password verified against ADMIN_PASSWORD_HASH (scrypt).
 *   2. Legacy raw token — body { token } equal to ADMIN_SECRET, kept so
 *      existing scripts / curl keep working.
 *
 * This route is intentionally NOT protected by the admin middleware — it is
 * the login step. Brute force is throttled per client IP.
 */

const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, matches signature TTL

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function issueCookie(): NextResponse {
  const cookieValue = signAdminCookie(getAdminSecret());
  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_token", cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}

export async function POST(req: NextRequest) {
  const secret = getAdminSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET is not configured on the server." },
      { status: 500 },
    );
  }

  // Throttle brute force: 5 attempts / minute / IP.
  const rl = checkRateLimit(`admin-login:${clientIp(req)}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Terlalu banyak percobaan. Coba lagi dalam ${rl.retryAfterSeconds} detik.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const body = await req.json().catch(() => ({}));

  // Form 1: username + password
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  if (username || password) {
    const expectedUser = process.env.ADMIN_USERNAME || "admin";
    const passwordHash = process.env.ADMIN_PASSWORD_HASH || "";

    if (!passwordHash) {
      return NextResponse.json(
        { error: "Login password belum dikonfigurasi (ADMIN_PASSWORD_HASH belum di-set)." },
        { status: 500 },
      );
    }

    if (safeEqualSecret(username, expectedUser) && verifyAdminPassword(password, passwordHash)) {
      return issueCookie();
    }
    // Uniform message — never reveal which field was wrong.
    return NextResponse.json(
      { error: "Username atau password salah." },
      { status: 401 },
    );
  }

  // Form 2: legacy raw token (scripts, curl)
  const token = String(body?.token ?? "").trim();
  if (token && safeEqualSecret(token, secret)) {
    return issueCookie();
  }

  return NextResponse.json(
    { error: "Unauthorized: kredensial admin tidak valid." },
    { status: 401 },
  );
}

/** GET /api/admin/auth — check whether the caller holds a valid admin session. */
export async function GET(req: NextRequest) {
  const auth = checkAdminAuth(req);
  return NextResponse.json({ authenticated: auth.authorized });
}

/** DELETE /api/admin/auth — clear the admin session cookie (logout). */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_token", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
