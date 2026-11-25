import type { MetadataRoute } from "next";
import { SITE_PUBLIC, SITE_URL } from "@/config/site";

/** /robots.txt – the launch switch (src/config/site.ts): allow and name the sitemap only when public. */
export default function robots(): MetadataRoute.Robots {
  if (!SITE_PUBLIC) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
