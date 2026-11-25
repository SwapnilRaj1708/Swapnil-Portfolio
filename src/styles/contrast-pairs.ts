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
};

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
];

export const MIN_RATIO = { text: 4.5, "non-text": 3 } as const;
