import type { MetadataRoute } from "next";
import { SITE_URL } from "@/shared/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /invite/* carries a bearer token in the URL — must never be
        // crawled or cached by a search engine.
        disallow: ["/*/home", "/*/profile", "/*/projects", "/*/invite"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
