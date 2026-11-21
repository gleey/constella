import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Protect admin API routes and destructive/mutating endpoints
  const isProtectedApi =
    pathname.startsWith("/api/admin") ||
    (pathname.startsWith("/api/pages/") && (method === "PUT" || method === "POST" || method === "DELETE")) ||
    (pathname.startsWith("/api/media/") && method === "DELETE");

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
    if (!token || token !== secret) {
      return NextResponse.json(
        { error: "Unauthorized: Missing or invalid admin token." },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/admin/:path*",
    "/api/pages/:path*",
    "/api/media/:path*",
  ],
};
