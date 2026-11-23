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
  // Hide the dev-only route indicator: it overlaps the graph controls and has
  // no value for remote testing. Compile/runtime errors are still surfaced.
  devIndicators: false,
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
