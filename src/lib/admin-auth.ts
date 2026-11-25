import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export function getAdminSecret(): string {
  return process.env.ADMIN_SECRET || process.env.ADMIN_TOKEN || "";
}

/** Constant-time secret comparison via SHA-256 digests (length-independent). */
export function safeEqualSecret(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Cookie session lifetime: 30 days, mirrored by the client-side setter. */
const COOKIE_TTL_SECONDS = 30 * 24 * 60 * 60;
const COOKIE_TTL_MS = COOKIE_TTL_SECONDS * 1000;

/**
 * Build a signed admin cookie value: `<expiryMs>.<hmac-sha256>`.
 * The cookie carries no secret material — only the expiry and a signature
 * derived from the secret — so it is safe to store in the browser and safe
 * to log. Forging one requires knowing ADMIN_SECRET.
 */
export function signAdminCookie(secret: string, now = Date.now()): string {
  const expiry = now + COOKIE_TTL_MS;
  const sig = crypto.createHmac("sha256", secret).update(String(expiry)).digest("hex");
  return `${expiry}.${sig}`;
}

/**
 * Verify a signed admin cookie value. Returns true only when the signature
 * matches the secret and the expiry is still in the future.
 */
export function verifyAdminCookie(secret: string, value: string, now = Date.now()): boolean {
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const expiry = Number(value.slice(0, dot));
  const sig = value.slice(dot + 1);
  if (!Number.isFinite(expiry) || expiry <= now) return false;
  if (!/^[a-f0-9]{64}$/i.test(sig)) return false;
  const expected = crypto.createHmac("sha256", secret).update(String(expiry)).digest("hex");
  // Constant-time compare so a timing side channel can't leak the signature.
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/**
 * Checks if the incoming request has valid admin credentials.
 * Supports:
 * 1. Header `x-admin-token: <secret>` (raw secret — scripts, curl)
 * 2. Header `Authorization: Bearer <secret>` (raw secret — scripts, curl)
 * 3. Cookie `admin_token=<secret>` (raw secret — legacy UI)
 * 4. Cookie `admin_token=<expiry>.<hmac>` (signed session — preferred UI)
 *
 * In local development (NODE_ENV !== "production"), if no secret is configured,
 * access is permitted so local testing works without barriers.
 */
export function checkAdminAuth(req: NextRequest): { authorized: boolean; error?: string } {
  const secret = getAdminSecret();

  // In non-production, if no secret is configured in .env, allow access
  if (!secret && process.env.NODE_ENV !== "production") {
    return { authorized: true };
  }

  if (!secret) {
    return {
      authorized: false,
      error: "Unauthorized: ADMIN_SECRET is not configured on the server.",
    };
  }

  // 1. Header x-admin-token
  const headerToken = req.headers.get("x-admin-token");
  if (headerToken && safeEqualSecret(headerToken, secret)) {
    return { authorized: true };
  }

  // 2. Authorization Bearer
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const bearer = authHeader.substring(7).trim();
    if (safeEqualSecret(bearer, secret)) {
      return { authorized: true };
    }
  }

  // 3 & 4. Cookie admin_token — raw secret (legacy) or signed session.
  const cookieToken = req.cookies.get("admin_token")?.value;
  if (cookieToken) {
    if (safeEqualSecret(cookieToken, secret)) return { authorized: true };
    if (verifyAdminCookie(secret, cookieToken)) return { authorized: true };
  }

  return {
    authorized: false,
    error: "Unauthorized: Admin access requires a valid admin token.",
  };
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  const auth = checkAdminAuth(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }
  return null;
}
