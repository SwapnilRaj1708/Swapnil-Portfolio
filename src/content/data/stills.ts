import type { ContentInput } from "../schema";

/**
 * Stage 1 stills (PF-028): one Blender render per chapter, each in two crops – `wide` for
 * landscape and wide screens, `portrait` for portrait and narrow ones. The hero (`port`) is
 * 16:9 / 9:16, every other chapter opens its home section with a 21:9 / 4:5 banner.
 *
 * Files are written by `npm run media:stills` from the owner-approved renders in
 * `Blender Assets/stills/` (REPORT-stills.md, runs 1 and 2) – see docs/assets.md. They stand in for
 * the 3D scene in the static tier, so they are decorative: no alt text (the canvas they replace is
 * hidden from assistive technology too, STANDARDS.md §1).
 */
const source = "Blender render, approved 2026-11-24 (PF-028)";

const banner = (chapter: "bus" | "memory" | "array" | "core" | "uplink") =>
  ({
    chapter,
    wide: { src: `/media/stills/still-s1-${chapter}-wide.webp`, width: 2560, height: 1080 },
    portrait: { src: `/media/stills/still-s1-${chapter}-portrait.webp`, width: 1080, height: 1350 },
    source,
  }) as const;

export const stills = [
  {
    chapter: "port",
    wide: { src: "/media/stills/still-s1-port-wide.webp", width: 2560, height: 1440 },
    portrait: { src: "/media/stills/still-s1-port-portrait.webp", width: 1080, height: 1920 },
    source,
  },
  banner("bus"),
  banner("memory"),
  banner("array"),
  banner("core"),
  banner("uplink"),
] satisfies ContentInput["stills"];

/** Background of every page's social image (1200 × 630, src/lib/social-image.tsx). */
export const socialImage = {
  src: "/media/stills/still-social.jpg",
  width: 1200,
  height: 630,
  source: "Blender render still-social, approved 2026-11-24 (PF-028)",
} satisfies ContentInput["socialImage"];
