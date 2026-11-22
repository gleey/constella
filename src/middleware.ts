import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // The login endpoint validates the secret itself and issues the signed
  // session cookie — protecting it with middleware would deadlock the login.
  const isAuthLogin = pathname === "/api/admin/auth";

  // Protect admin API routes and destructive/mutating endpoints
  const isProtectedApi =
    !isAuthLogin &&
    (pathname.startsWith("/api/admin") ||
      (pathname.startsWith("/api/pages/") && (method === "PUT" || method === "POST" || method === "DELETE")) ||
      (pathname.startsWith("/api/media/") && method === "DELETE"));

  if (isProtectedApi) {
    const secret = process.env.ADMIN_SECRET || process.env.ADMIN_TOKEN || "";

    // In non-production, if no secret is set, allow access for easy local development
    if (!secret && process.env.NODE_ENV !== "production") {
      return NextResponse.next();
    }

    if (!secret) {
      return NextResponse.json(
        { error: "Unauthorized: ADMIN_SECRET is not configured on the server." },
        { status: 401 }
      );
    }

    const headerToken = request.headers.get("x-admin-token");
    const authHeader = request.headers.get("authorization");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const cookieToken = request.cookies.get("admin_token")?.value;

    const token = headerToken || bearer || cookieToken;
    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized: Missing or invalid admin token." },
        { status: 401 }
      );
    }

    // Accept the raw secret (scripts, curl) or a signed session cookie (UI).
    const isValid =
      token === secret ||
      (cookieToken === token && (await verifySignedCookie(secret, cookieToken)));
    if (!isValid) {
      return NextResponse.json(
        { error: "Unauthorized: Missing or invalid admin token." },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

/**
 * Edge-safe verification of a signed admin cookie (`<expiryMs>.<hmac-sha256-hex>`).
 * Duplicated from src/lib/admin-auth.ts because the middleware runs in the
 * Edge runtime, which cannot import node:crypto. Uses Web Crypto (async HMAC)
 * instead. Both implementations sign/verify the same value, so a cookie
 * issued by the Node-side /api/admin/auth route validates here.
 */
async function verifySignedCookie(secret: string, value: string): Promise<boolean> {
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const expiry = Number(value.slice(0, dot));
  const sig = value.slice(dot + 1);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;
  if (!/^[a-f0-9]{64}$/i.test(sig)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(expiry)));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return sig.toLowerCase() === expected;
}

export const config = {
  matcher: [
    "/api/admin/:path*",
    "/api/pages/:path*",
    "/api/media/:path*",
  ],
};
