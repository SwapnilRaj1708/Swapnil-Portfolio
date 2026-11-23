/**
 * How text sits on the stage 1 stills (PF-028): the scrims laid over each still and the area
 * of the image the text may cover. One source for three readers:
 *   - the components draw the scrims from it (src/components/stills/),
 *   - still-contrast.test.ts samples the encoded stills under each text area, applies the scrim
 *     and requires 4.5:1 for every text colour,
 *   - e2e/stills.spec.ts measures where the text really lands on the drawn image, at several
 *     viewports, and requires it inside the text area.
 *
 * A scrim is a gradient of the `background` colour from fully transparent to `alpha`, laid over
 * the image. Its stops are [position, alpha]: position 0 is the edge named by `from`, 1 the
 * opposite edge; between stops alpha changes linearly (how browsers interpolate a gradient of one
 * colour at different opacities). Areas are fractions of the image: x from the left, y from the
 * top.
 */
import type { Chapter } from "@/content/schema";
import type { PaletteToken } from "./palette";

export type Crop = "wide" | "portrait";

export type Scrim = {
  /** The edge the gradient starts from (its first stop). */
  from: "top" | "bottom" | "left" | "right";
  stops: readonly (readonly [position: number, alpha: number])[];
};

export type Area = { x0: number; x1: number; y0: number; y1: number };

export type StillLayout = {
  scrims: readonly Scrim[];
  /** Where text may sit on the image (fractions of the image). */
  textArea: Area;
  /** The colours of the text that sits directly on the image. */
  textColors: readonly PaletteToken[];
  /**
   * Whether the contrast test may count the scrim. Only where the drawn image keeps the box's
   * proportions (the banners: 21:9 box ≈ 2560 × 1080, 4:5 box = 1080 × 1350, cropped only at the
   * side away from the text), so a point of the image sits under the same scrim alpha at every
   * size. The hero's box changes shape with the window, so its text must pass on the image alone;
   * its scrims are extra margin and the fade into the page.
   */
  scrimCredit: boolean;
};

/** Text-safe areas from the look bible (BRIEF.md §4) and REPORT-stills.md. */
const HERO_WIDE_AREA: Area = { x0: 0, x1: 0.4, y0: 0, y1: 1 };
const HERO_PORTRAIT_AREA: Area = { x0: 0, x1: 1, y0: 0, y1: 0.4 };
/**
 * Banners: the index label and heading sit in the bottom-left – bottom 38 % and left 70 % of the
 * wide crops; bottom 35 % and the full width of the 4:5 crops, where a long heading may wrap
 * across the whole width. (Above 65 % the 4:5 crops hold bright details – Bus's cyan streaks,
 * Memory's lit segments – that the text must stay clear of.)
 */
const BANNER_WIDE_AREA: Area = { x0: 0, x1: 0.7, y0: 0.62, y1: 1 };
const BANNER_PORTRAIT_AREA: Area = { x0: 0, x1: 1, y0: 0.65, y1: 1 };

const HERO_TEXT: readonly PaletteToken[] = ["text", "text-muted"];
/** Index label (accent-trace, the binding one) and heading (text). */
const BANNER_TEXT: readonly PaletteToken[] = ["accent-trace", "text"];

/** Every banner: dark at the bottom where the heading sits, clear in the upper part of the image. */
const BANNER_SCRIM: Scrim = {
  from: "bottom",
  stops: [
    [0, 0.72],
    [0.4, 0.62],
    [0.7, 0],
  ],
};
/**
 * Core: its amber street grid runs through the lower band (max luma 194, REPORT-stills run 2), so
 * the strongest scrim – and a second one from the right, where the avenue is brightest.
 */
const CORE_SCRIMS: readonly Scrim[] = [
  {
    from: "bottom",
    stops: [
      [0, 0.86],
      [0.45, 0.8],
      [0.8, 0],
    ],
  },
  {
    from: "right",
    stops: [
      [0, 0.4],
      [0.45, 0],
    ],
  },
];
/** Every banner's top edge fades in from the page, so a section does not start on a hard edge. */
const BANNER_TOP_FADE: Scrim = {
  from: "top",
  stops: [
    [0, 0.75],
    [0.2, 0],
  ],
};
/** The bottom of the hero fades into the page, so the first banner does not start on an edge. */
const HERO_BOTTOM_FADE: Scrim = {
  from: "bottom",
  stops: [
    [0, 0.85],
    [0.18, 0],
  ],
};

const banner = (scrims: readonly Scrim[], portraitScrims: readonly Scrim[] = scrims) =>
  ({
    wide: { scrims, textArea: BANNER_WIDE_AREA, textColors: BANNER_TEXT, scrimCredit: true },
    portrait: { scrims: portraitScrims, textArea: BANNER_PORTRAIT_AREA, textColors: BANNER_TEXT, scrimCredit: true },
  }) satisfies Record<Crop, StillLayout>;

export const STILL_LAYOUT: Record<Chapter, Record<Crop, StillLayout>> = {
  port: {
    wide: {
      scrims: [
        {
          from: "left",
          stops: [
            [0, 0.6],
            [0.3, 0.45],
            [0.55, 0],
          ],
        },
        HERO_BOTTOM_FADE,
      ],
      textArea: HERO_WIDE_AREA,
      textColors: HERO_TEXT,
      scrimCredit: false,
    },
    portrait: {
      scrims: [
        {
          from: "top",
          stops: [
            [0, 0.7],
            [0.3, 0.5],
            [0.55, 0],
          ],
        },
        HERO_BOTTOM_FADE,
      ],
      textArea: HERO_PORTRAIT_AREA,
      textColors: HERO_TEXT,
      scrimCredit: false,
    },
  },
  bus: banner([BANNER_SCRIM, BANNER_TOP_FADE]),
  memory: banner([BANNER_SCRIM, BANNER_TOP_FADE]),
  array: banner([BANNER_SCRIM, BANNER_TOP_FADE]),
  // On the 4:5 crop the heading spans the full width, so the right-hand scrim would only darken
  // the image without protecting more text; the bottom scrim carries it alone.
  core: banner([...CORE_SCRIMS, BANNER_TOP_FADE], [CORE_SCRIMS[0], BANNER_TOP_FADE]),
  uplink: banner([BANNER_SCRIM, BANNER_TOP_FADE]),
};

/**
 * The social image (1200 × 630, src/lib/social-image.tsx): the still-social render is calm in its
 * left half (REPORT-stills run 1), where the page label, name and role sit. The image has a fixed
 * size, so its scrim always lies exactly where the test assumes.
 */
export const SOCIAL_LAYOUT: StillLayout = {
  scrims: [
    {
      from: "left",
      stops: [
        [0, 0.55],
        [0.5, 0.3],
        [0.7, 0],
      ],
    },
  ],
  textArea: { x0: 0, x1: 0.5, y0: 0, y1: 1 },
  textColors: ["accent-trace", "text", "text-muted"],
  scrimCredit: true,
};

const DIRECTION: Record<Scrim["from"], string> = { top: "to bottom", bottom: "to top", left: "to right", right: "to left" };

/** The scrim as a CSS gradient of the background colour token (no raw colour values). */
export function scrimGradient(scrim: Scrim): string {
  const stops = scrim.stops.map(
    ([position, alpha]) => `color-mix(in srgb, var(--color-background) ${round(alpha * 100)}%, transparent) ${round(position * 100)}%`,
  );
  return `linear-gradient(${DIRECTION[scrim.from]}, ${stops.join(", ")})`;
}

/**
 * The same gradient with the colour written out, for renderers without CSS custom properties or
 * color-mix() (the social images, next/og). `hex` is a palette value (src/styles/palette.ts).
 */
export function scrimGradientLiteral(scrim: Scrim, hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const stops = scrim.stops.map(([position, alpha]) => `rgba(${r}, ${g}, ${b}, ${round(alpha)}) ${round(position * 100)}%`);
  return `linear-gradient(${DIRECTION[scrim.from]}, ${stops.join(", ")})`;
}

/** The scrim's alpha at a point of its box (x, y as fractions, y from the top). */
export function scrimAlpha(scrim: Scrim, x: number, y: number): number {
  const t = { top: y, bottom: 1 - y, left: x, right: 1 - x }[scrim.from];
  const stops = scrim.stops;
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [p1, a1] = stops[i];
    if (t <= p1) {
      const [p0, a0] = stops[i - 1];
      return a0 + ((t - p0) / (p1 - p0)) * (a1 - a0);
    }
  }
  return stops[stops.length - 1][1];
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
