import type { NextConfig } from "next";

/**
 * Optional admin path obfuscation. When ADMIN_PATH is set (e.g. "console-x7k29q"),
 * the admin UI is served at /<ADMIN_PATH> while the source tree keeps the plain
 * /admin folder. This keeps the codebase simple (always /admin) while the public
 * surface can be a non-guessable path. The middleware additionally 404s /admin
 * when a custom path is active.
 *
 * NOTE: obscurity only reduces scanner noise — the real protection is the
 * signed session cookie + admin password enforced by src/middleware.ts.
 */
const adminPath = (process.env.ADMIN_PATH || "").trim().replace(/^\/+|\/+$/g, "");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Hide the dev-only route indicator: it overlaps the graph controls and has
  // no value for remote testing. Compile/runtime errors are still surfaced.
  devIndicators: false,
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    const csp = [
      "default-src 'self'",
      isProd ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      isProd ? "connect-src 'self'" : "connect-src 'self' ws: wss:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; ");

    const securityHeaders = [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
    ];
    const rules = [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
    if (adminPath && adminPath !== "admin") {
      rules.push({
        source: `/${adminPath}/:path*`,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      });
    }
    return rules;
  },
  async rewrites() {
    if (!adminPath || adminPath === "admin") return [];
    return [
      {
        source: `/${adminPath}`,
        destination: "/admin",
      },
      {
        source: `/${adminPath}/:path*`,
        destination: "/admin/:path*",
      },
    ];
  },
};

export default nextConfig;
