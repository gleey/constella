import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Resolve the configured admin surface path. When ADMIN_PATH is set (e.g.
 * "console-x7k29q"), the admin UI lives at /<ADMIN_PATH> and the plain /admin
 * path is hidden (404). This is an obscurity layer to cut down random scanner
 * noise — the real defense remains the signed session cookie + password.
 * Keeping it in an env var means the path can change per-deploy without a
 * code change, and the value is never shipped to the client bundle.
 */
function getAdminPath(): string {
  const raw = (process.env.ADMIN_PATH || "").trim().replace(/^\/+|\/+$/g, "");
  return raw || "admin";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;
  const adminPath = getAdminPath();

  // The login endpoint validates the secret itself and issues the signed
  // session cookie — protecting it with middleware would deadlock the login.
  const isAuthLogin = pathname === "/api/admin/auth";

  // -------------------------------------------------------------------------
  // 1. Admin PAGE gating: unauthenticated visitors are bounced to the login
  //    page before any admin markup is served. This covers the real /admin
  //    tree (when it is the active path) and any custom ADMIN_PATH surface
  //    that next.config rewrites onto it.
  // -------------------------------------------------------------------------
  const isLoginPage = pathname === "/admin/login" || pathname === `/${adminPath}/login`;
  const isAdminPage =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === `/${adminPath}` ||
    pathname.startsWith(`/${adminPath}/`);

  if (isAdminPage) {
    // Hide the default /admin surface (including /admin/login) when a custom
    // path is configured so scanners probing /admin* get 404.
    if (adminPath !== "admin" && pathname.startsWith("/admin")) {
      return new NextResponse(null, { status: 404 });
    }

    const secret = process.env.ADMIN_SECRET || process.env.ADMIN_TOKEN || "";
    // In non-production with no secret configured, allow through for easy dev.
    const devBypass = !secret && process.env.NODE_ENV !== "production";
    if (!devBypass && !isLoginPage) {
      const cookieToken = request.cookies.get("admin_token")?.value || "";
      const valid =
        cookieToken &&
        secret &&
        (safeEqual(cookieToken, secret) || (await verifySignedCookie(secret, cookieToken)));
      if (!valid) {
        const loginUrl = new URL(`/${adminPath}/login`, request.url);
        // Preserve where the user was heading so we can return after login.
        loginUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. Admin API + mutating endpoint protection.
  // -------------------------------------------------------------------------
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
      safeEqual(token, secret) ||
      (cookieToken ? safeEqual(cookieToken, token) && (await verifySignedCookie(secret, cookieToken)) : false);
    if (!isValid) {
      return NextResponse.json(
        { error: "Unauthorized: Missing or invalid admin token." },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

function safeEqual(a: string, b: string): boolean {
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  const len = Math.max(ba.length, bb.length);
  let diff = ba.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
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
  return safeEqual(sig.toLowerCase(), expected);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/pages/:path*",
    "/api/media/:path*",
    // Custom admin surface — matched only when ADMIN_PATH is set; the
    // middleware body decides whether it is active.
    "/:adminPath((?!api|_next|.*\\..*).*)",
  ],
};
