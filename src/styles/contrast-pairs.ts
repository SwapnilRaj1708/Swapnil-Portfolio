/**
 * Every foreground/background colour-token pair the interface uses, with where it is used.
 * The contrast test (contrast.test.ts) fails if a text pair is below 4.5:1 or a non-text pair
 * (focus ring, control borders that carry meaning) is below 3:1. Add a row whenever a component
 * puts a new colour on a new background. Names are the --color-* tokens without the prefix.
 */
export type ContrastPair = {
  fg: string;
  bg: string;
  use: string;
  kind: "text" | "non-text";
  /**
   * The background is translucent (PF-008: the canvas scrim): `bg` at `alpha` laid over `behind`,
   * the brightest colour that can be under it. The ratio is computed against that mix.
   */
  over?: { alpha: number; behind: string; what: string };
};

/**
 * The canvas scrim (PF-008, `canvas-scrim` in globals.css): the background colour at 90 % under the
 * text of every home section while the 3D canvas shows behind the page. contrast.test.ts keeps
 * the stylesheet's percentage equal to this value.
 */
export const CANVAS_SCRIM_ALPHA = 0.9;

/**
 * The worst case behind the scrim: pure white, the brightest pixel the canvas can output at all
 * (sRGB after tone mapping is at most 1.0). The stand-in scene is far darker (unlit
 * `surface-raised` pillars, the background clear colour, the test object's lit chip and amber
 * strip); proving the pairs against white makes them hold for any scene a later chapter brings.
 */
export const CANVAS_WORST_CASE = { hex: "#ffffff", what: "pure white (the canvas's brightest possible pixel)" } as const;

const onScrim = { alpha: CANVAS_SCRIM_ALPHA, behind: CANVAS_WORST_CASE.hex, what: CANVAS_WORST_CASE.what };

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { fg: "text", bg: "background", use: "body text, headings, header, footer", kind: "text" },
  { fg: "text", bg: "surface", use: "panel, secondary button, chip, status chip", kind: "text" },
  { fg: "text", bg: "surface-raised", use: "raised panel, button hover, mobile menu, skip link", kind: "text" },
  { fg: "text", bg: "signal-soft", use: "selected chip", kind: "text" },
  { fg: "text-muted", bg: "background", use: "nav links, role, footer label", kind: "text" },
  { fg: "text-muted", bg: "surface", use: "panel label, disabled button and chip", kind: "text" },
  { fg: "text-muted", bg: "surface-raised", use: "raised panel label", kind: "text" },
  { fg: "accent-trace", bg: "background", use: "section index label, brand mark", kind: "text" },
  { fg: "accent-trace", bg: "surface", use: "section index label inside a panel", kind: "text" },
  { fg: "accent-signal", bg: "background", use: "inline link, active nav", kind: "text" },
  { fg: "accent-signal", bg: "surface", use: "inline link inside a panel", kind: "text" },
  { fg: "text", bg: "surface-raised", use: "readout tile: project name", kind: "text" },
  { fg: "text-muted", bg: "surface-raised", use: "readout tile: preview label", kind: "text" },
  { fg: "accent-trace", bg: "surface-raised", use: "readout tile: trace line", kind: "non-text" },
  { fg: "text", bg: "surface", use: "About facts readout: values", kind: "text" },
  { fg: "text-muted", bg: "surface", use: "About facts readout: labels, value separator", kind: "text" },
  { fg: "accent-trace", bg: "surface", use: "About facts readout: trace line", kind: "non-text" },
  { fg: "accent-signal", bg: "surface", use: "About facts readout: status dot", kind: "non-text" },
  { fg: "background", bg: "accent-trace", use: "primary button", kind: "text" },
  { fg: "background", bg: "trace-hover", use: "primary button, hover", kind: "text" },
  { fg: "accent-signal", bg: "background", use: "focus ring on the page", kind: "non-text" },
  { fg: "accent-signal", bg: "surface", use: "focus ring on a panel, selected chip border", kind: "non-text" },
  { fg: "accent-signal", bg: "surface-raised", use: "focus ring on the mobile menu", kind: "non-text" },
  { fg: "text-muted", bg: "background", use: "contact flow: text field border", kind: "non-text" },
  { fg: "accent-trace", bg: "background", use: "contact flow: border of a field with an error", kind: "non-text" },
  { fg: "accent-signal", bg: "surface", use: "contact flow: progress bar, steps done", kind: "non-text" },
  // PF-007: the hero over the 3D canvas. The canvas clears to the background colour and the test
  // object is kept out of the hero copy (scene/layout.ts; e2e/journey.spec.ts checks its bounds on
  // screen), so the copy's text always stands on the background colour; the status chip and the
  // two links stand on their own surfaces (pairs above). The header stays solid background.
  { fg: "text", bg: "background", use: "hero name and pitch over the 3D canvas", kind: "text" },
  { fg: "text-muted", bg: "background", use: "hero role and place over the 3D canvas", kind: "text" },
  // PF-008: the camera travels. The hero copy has no scrim; behind it the stand-in scene shows only
  // the clear colour (background) and the marker pillars, unlit `surface-raised` (tone mapping only
  // darkens them). The lit test object is kept out of the copy along the whole port chapter
  // (e2e/scroll.spec.ts checks its bounds at the port's start, middle and end).
  { fg: "text", bg: "surface-raised", use: "hero name and pitch over a stand-in marker pillar", kind: "text" },
  { fg: "text-muted", bg: "surface-raised", use: "hero role and place over a stand-in marker pillar", kind: "text" },
  // PF-008: every other home section's text over the canvas stands on the canvas scrim, proven
  // against the worst case behind it (pure white).
  { fg: "text", bg: "background", use: "section headings and body text on the canvas scrim", kind: "text", over: onScrim },
  { fg: "text-muted", bg: "background", use: "labels, roles, dates on the canvas scrim", kind: "text", over: onScrim },
  { fg: "accent-trace", bg: "background", use: "section index label on the canvas scrim", kind: "text", over: onScrim },
  { fg: "accent-signal", bg: "background", use: "inline links (All work →, email) on the canvas scrim", kind: "text", over: onScrim },
  { fg: "accent-signal", bg: "background", use: "focus ring on the canvas scrim", kind: "non-text", over: onScrim },
  // PF-008: the navigation's current-chapter mark (aria-current="location"): text colour with a
  // trace-accent underline, in the header (background) and the phone menu (surface-raised).
  { fg: "text", bg: "background", use: "navigation: current chapter link", kind: "text" },
  { fg: "accent-trace", bg: "background", use: "navigation: current chapter underline", kind: "non-text" },
  { fg: "text", bg: "surface-raised", use: "phone menu: current chapter link", kind: "text" },
  { fg: "accent-trace", bg: "surface-raised", use: "phone menu: current chapter underline", kind: "non-text" },
];

/** The colour a pair's text actually stands on (a translucent background mixed over its worst case). */
export function pairBackground(pair: ContrastPair, colors: Record<string, string>, mix: (a: string, percentA: number, b: string) => string): string {
  const bg = colors[pair.bg];
  return pair.over ? mix(bg, pair.over.alpha * 100, pair.over.behind) : bg;
}

export const MIN_RATIO = { text: 4.5, "non-text": 3 } as const;
