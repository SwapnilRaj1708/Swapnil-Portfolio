/**
 * The palette tokens as plain hex values, for the few places that cannot read CSS custom
 * properties: the web manifest, the browser theme colour and the social images (drawn at build
 * time by next/og). The stylesheet stays the one source (`@theme` in src/app/globals.css):
 * palette.test.ts fails if a value here differs from it.
 */
export const PALETTE = {
  background: "#07090c",
  surface: "#12161c",
  "surface-raised": "#1c222a",
  "accent-trace": "#e08a3c",
  "accent-signal": "#cff6ff",
  text: "#e8ecf1",
  "text-muted": "#8e97a3",
} as const;

export type PaletteToken = keyof typeof PALETTE;
