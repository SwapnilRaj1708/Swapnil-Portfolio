import type { NextConfig } from "next";
import { NOINDEX_DIRECTIVE, SITE_LAUNCHED } from "./src/config/site";

// Dev-only pages (/dev/styleguide, /dev/type) are files named `page.dev.tsx`. They become routes
// only when the build (or dev server) runs with ENABLE_DEV_PAGES=1; otherwise Next.js does not
// treat them as pages at all, so they are not built and every /dev/* URL is a 404 – locally and
// on Vercel alike (STANDARDS.md §9: development-only code excluded by a build-time condition).
const DEV_PAGES = process.env.ENABLE_DEV_PAGES === "1";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  pageExtensions: DEV_PAGES ? ["dev.tsx", "tsx", "ts", "jsx", "js"] : ["tsx", "ts", "jsx", "js"],
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

export default nextConfig;
