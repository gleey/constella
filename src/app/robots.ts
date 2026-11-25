import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const adminPath = (process.env.ADMIN_PATH || "").trim().replace(/^\/+|\/+$/g, "");
  const disallow = ["/admin", "/api/admin"];
  if (adminPath && adminPath !== "admin") {
    disallow.push(`/${adminPath}`);
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow,
      },
    ],
    ...(siteUrl ? { sitemap: `${siteUrl}/sitemap.xml` } : {}),
  };
}
