import path from "node:path";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { NOINDEX_DIRECTIVE, SITE_LAUNCHED } from "./src/config/site";
import { checkContentFiles } from "./src/content/check-files";
import { content } from "./src/content/index";

// Dev-only pages (/dev/styleguide, /dev/type) are files named `page.dev.tsx`. They become routes
// only when the build (or dev server) runs with ENABLE_DEV_PAGES=1; otherwise Next.js does not
// treat them as pages at all, so they are not built and every /dev/* URL is a 404 – locally and
// on Vercel alike (STANDARDS.md §9: development-only code excluded by a build-time condition).
const DEV_PAGES = process.env.ENABLE_DEV_PAGES === "1";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  pageExtensions: DEV_PAGES ? ["dev.tsx", "tsx", "ts", "jsx", "js"] : ["tsx", "ts", "jsx", "js"],
  images: {
    // AVIF where the browser accepts it (smaller than WebP at the same quality), WebP otherwise.
    // Each format is optimised on first request and cached separately.
    formats: ["image/avif", "image/webp"],
    // Next 16 requires the allowlist; 75 is its default and the only quality the site uses.
    qualities: [75],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    if (SITE_LAUNCHED) return [];
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: NOINDEX_DIRECTIVE }],
      },
    ];
  },
};

/**
 * Content check at build (and dev) time. Importing src/content already validated every field
 * against the schema (an invalid field throws a ContentError naming it). Here: every media file
 * and the resume PDF the content names must exist in public/, with the stated pixel size.
 */
export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD || phase === PHASE_DEVELOPMENT_SERVER) {
    const problems = checkContentFiles(content, path.join(process.cwd(), "public"));
    if (problems.length) {
      throw new Error(`Content files missing or wrong (see docs/content.md):\n  ${problems.join("\n  ")}`);
    }
  }
  return nextConfig;
}
