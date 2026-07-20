import type { MetadataRoute } from "next";
import { SITE_URL } from "@/shared/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/*/home", "/*/profile"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
