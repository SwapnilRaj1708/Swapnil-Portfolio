import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { projects } from "@/content";

/**
 * /sitemap.xml – every public page: the home page, /work, each case study and /resume.
 * Contact result pages, the 404 and the dev pages are left out. No `lastModified`: the site has
 * no per-page edit dates, and a build date would claim every page changed on every deploy.
 * robots.txt names this file only when the site is public (src/config/site.ts).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL },
    { url: `${SITE_URL}/work` },
    ...projects.map((p) => ({ url: `${SITE_URL}/work/${p.slug}` })),
    { url: `${SITE_URL}/resume` },
  ];
}
