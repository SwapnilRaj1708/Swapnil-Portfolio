import type { NextConfig } from "next";
import { NOINDEX_DIRECTIVE, SITE_LAUNCHED } from "./src/config/site";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
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
