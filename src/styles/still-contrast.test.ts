// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { relativeLuminance } from "@/lib/contrast";
import { socialImage, stills } from "@/content";
import { PALETTE } from "./palette";
import { type Crop, SOCIAL_LAYOUT, STILL_LAYOUT, type StillLayout, scrimAlpha } from "./stills";

// Text over the stills keeps at least 4.5:1 (STANDARDS.md §7, PF-028). For each still and crop:
// decode the encoded file the site ships (and the same file re-encoded the way next/image serves
// it, WebP quality 75, whose artefacts can lift a pixel), take every pixel under the text area,
// lay the scrim over it as the browser does (background colour at the scrim's alpha, blended in
// sRGB), and find the brightest result. Every text colour that sits there must reach 4.5:1
// against it – the worst case, wherever the text happens to fall inside the area.

const PUBLIC = path.resolve(__dirname, "../../public");
const MIN = 4.5;
const BG = [7, 9, 12]; // checked against PALETTE.background below

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** Brightest luminance under the area after the scrims (when the layout may count them). */
async function brightestUnderText(file: Buffer, layout: StillLayout) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const { x0, x1, y0, y1 } = layout.textArea;
  let max = 0;
  for (let y = Math.floor(y0 * h); y < Math.ceil(y1 * h); y++) {
    const fy = (y + 0.5) / h;
    for (let x = Math.floor(x0 * w); x < Math.ceil(x1 * w); x++) {
      const fx = (x + 0.5) / w;
      // Every scrim layer over the image: keep = share of the image that shows through.
      let keep = 1;
      if (layout.scrimCredit) for (const s of layout.scrims) keep *= 1 - scrimAlpha(s, fx, fy);
      const i = (y * w + x) * 3;
      const l = luminance(
        data[i] * keep + BG[0] * (1 - keep),
        data[i + 1] * keep + BG[1] * (1 - keep),
        data[i + 2] * keep + BG[2] * (1 - keep),
      );
      if (l > max) max = l;
    }
  }
  return max;
}

const ratio = (fg: number, bg: number) => (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);

type Case = { name: string; src: string; layout: StillLayout };
const cases: Case[] = [
  ...stills.flatMap((s) =>
    (["wide", "portrait"] as Crop[]).map((crop) => ({
      name: `${s.chapter} ${crop}`,
      src: s[crop].src,
      layout: STILL_LAYOUT[s.chapter][crop],
    })),
  ),
  { name: "social", src: socialImage.src, layout: SOCIAL_LAYOUT },
];

describe("text over the stills", () => {
  it("blends with the background token", () => {
    expect(`#${BG.map((v) => v.toString(16).padStart(2, "0")).join("")}`).toBe(PALETTE.background);
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s keeps every text colour at 4.5:1 or more", async (_name, c) => {
    const master = readFileSync(path.join(PUBLIC, c.src));
    const served = await sharp(master).webp({ quality: 75 }).toBuffer();
    const brightest = Math.max(await brightestUnderText(master, c.layout), await brightestUnderText(served, c.layout));
    const results = c.layout.textColors.map((token) => ({
      token,
      ratio: ratio(relativeLuminance(PALETTE[token]), brightest),
    }));
    console.log(
      `[still contrast] ${c.name.padEnd(16)} brightest under text L=${brightest.toFixed(4)}${c.layout.scrimCredit ? " (with scrim)" : " (image alone)"}  ` +
        results.map((r) => `${r.token} ${r.ratio.toFixed(2)}:1`).join("  "),
    );
    for (const r of results) expect(r.ratio, `${c.name}: ${r.token}`).toBeGreaterThanOrEqual(MIN);
  }, 30_000);
});
