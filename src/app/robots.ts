import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const adminPath = (process.env.ADMIN_PATH || "").trim().replace(/^\/+|\/+$/g, "");
  const disallow = ["/admin", "/api/admin"];
  if (adminPath && adminPath !== "admin") {
    disallow.push(`/${adminPath}`);
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow,
      },
    ],
  };
}
