import type { MetadataRoute } from "next";
import { identity, site } from "@/content";
import { PALETTE } from "@/styles/palette";

/**
 * Web manifest (PF-028, the installed Next.js's `manifest.ts` convention): name, short name, the
 * site's background colour as theme and background, and the app icons. The icon files are
 * `src/app/icon1.png` (192 px) and `icon2.png` (512 px), written by `npm run media:stills` from the
 * Blender icon mark; Next serves them at these paths.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.meta.home.title,
    short_name: identity.name,
    description: site.meta.home.description,
    start_url: "/",
    display: "browser",
    theme_color: PALETTE.background,
    background_color: PALETTE.background,
    icons: [
      { src: "/icon1.png", sizes: "192x192", type: "image/png" },
      { src: "/icon2.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
