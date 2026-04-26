import type { MetadataRoute } from "next";

const SITE = "https://nodosol.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Single-use token URLs and authenticated wallet surfaces should
        // never end up in search indexes.
        disallow: [
          "/api/",
          "/verify",
          "/u",
          "/admin",
          "/admin/",
          "/settings",
          "/settings/",
          "/welcome",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
