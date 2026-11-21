import { NextRequest, NextResponse } from "next/server";

export function getAdminSecret(): string {
  return process.env.ADMIN_SECRET || process.env.ADMIN_TOKEN || "";
}

/**
 * Checks if the incoming request has valid admin credentials.
 * Supports:
 * 1. Header `x-admin-token: <secret>`
 * 2. Header `Authorization: Bearer <secret>`
 * 3. Cookie `admin_token=<secret>`
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
  if (headerToken && headerToken === secret) {
    return { authorized: true };
  }

  // 2. Authorization Bearer
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const bearer = authHeader.substring(7).trim();
    if (bearer === secret) {
      return { authorized: true };
    }
  }

  // 3. Cookie admin_token
  const cookieToken = req.cookies.get("admin_token")?.value;
  if (cookieToken && cookieToken === secret) {
    return { authorized: true };
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
