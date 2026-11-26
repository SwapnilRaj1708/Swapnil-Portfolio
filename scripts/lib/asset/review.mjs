// `npm run asset -- <key> --review <ID>`: a side-by-side crop of each colour texture for the review
// (.review/<ID>/): the original PNG, the chosen KTX2 encoding and the rejected one, decoded back to
// pixels with `ktx extract --transcode rgba8`. The crop is the 256 px tile where the rejected
// encoding differs most from the original; a second row shows the same crops at 3× brightness,
// because the bakes are dark and the differences sit in the shadows.

import path from "node:path";
import sharp from "sharp";
import { runKtx } from "./ktx.mjs";

const PANEL = 512;
const GAP = 8;
const LABEL = 44;
const ROW_LABEL = 30;

async function decodeKtx(ktx, file, channels) {
  const out = file.replace(/\.ktx2$/, "-decoded.png");
  await runKtx(ktx.bin, ["extract", "--transcode", "rgba8", "--testrun", file, out]);
  const image = sharp(out);
  return (channels < 4 ? image.removeAlpha() : image).raw().toBuffer();
}

function tileErrors(a, b, width, height, channels, tile) {
  const step = tile / 2;
  let best = { x: 0, y: 0, error: -1 };
  for (let y = 0; y + tile <= height; y += step) {
    for (let x = 0; x + tile <= width; x += step) {
      let sum = 0;
      for (let row = y; row < y + tile; row++) {
        const start = (row * width + x) * channels;
        for (let i = start; i < start + tile * channels; i++) sum += Math.abs(a[i] - b[i]);
      }
      const error = sum / (tile * tile * channels);
      if (error > best.error) best = { x, y, error };
    }
  }
  return best;
}

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function labelSvg(width, height, lines, size) {
  const text = lines
    .map((line, i) => `<text x="10" y="${18 + i * (size + 4)}" font-family="Consolas, monospace" font-size="${size}" fill="#e8ecf1">${escape(line)}</text>`)
    .join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${text}</svg>`);
}

/** Writes the comparison for one encoded texture; returns what it measured. */
export async function writeTextureComparison({ ktx, texture, outFile }) {
  const meta = await sharp(texture.sourcePng).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const channels = meta.channels ?? 3;
  const original = await sharp(texture.sourcePng).raw().toBuffer();
  const decoded = [];
  for (const c of texture.candidates) decoded.push({ ...c, pixels: await decodeKtx(ktx, c.file, channels) });
  const chosen = decoded.find((c) => c.codec === texture.codec) ?? decoded[0];
  const rejected = decoded.find((c) => c !== chosen) ?? null;
  const meanError = (pixels) => {
    let sum = 0;
    let max = 0;
    for (let i = 0; i < original.length; i++) {
      const e = Math.abs(original[i] - pixels[i]);
      sum += e;
      if (e > max) max = e;
    }
    return { mean: Math.round((sum / original.length) * 1000) / 1000, max };
  };
  const tile = Math.min(256, width / 2, height / 2);
  const crop = tileErrors(original, (rejected ?? chosen).pixels, width, height, channels, tile);
  const panels = [
    { title: "ORIGINAL PNG", detail: `${width} × ${height}, as exported`, pixels: original },
    { title: `CHOSEN · ${chosen.codec.toUpperCase()}`, detail: `${(chosen.bytes / 1000).toFixed(1)} KB · SSIM ${chosen.ssim.toFixed(4)} · ${chosen.psnr.toFixed(1)} dB`, pixels: chosen.pixels },
    ...(rejected
      ? [{ title: `REJECTED · ${rejected.codec.toUpperCase()}`, detail: `${(rejected.bytes / 1000).toFixed(1)} KB · SSIM ${rejected.ssim.toFixed(4)} · ${rejected.psnr.toFixed(1)} dB`, pixels: rejected.pixels }]
      : []),
  ];
  const crops = async (pixels, gain) =>
    sharp(pixels, { raw: { width, height, channels } })
      .extract({ left: crop.x, top: crop.y, width: tile, height: tile })
      .linear(gain, 0)
      .resize(PANEL, PANEL, { kernel: "nearest" })
      .png()
      .toBuffer();
  const columns = panels.length;
  const totalWidth = columns * PANEL + (columns - 1) * GAP;
  const totalHeight = LABEL + PANEL + ROW_LABEL + PANEL + ROW_LABEL;
  const composites = [];
  for (let i = 0; i < columns; i++) {
    const left = i * (PANEL + GAP);
    composites.push({ input: labelSvg(PANEL, LABEL, [panels[i].title, panels[i].detail], 14), left, top: 0 });
    composites.push({ input: await crops(panels[i].pixels, 1), left, top: LABEL });
    composites.push({ input: await crops(panels[i].pixels, 3), left, top: LABEL + PANEL + ROW_LABEL });
  }
  composites.push({
    input: labelSvg(totalWidth, ROW_LABEL, [`${texture.name}: ${tile} px crop at (${crop.x}, ${crop.y}), shown ${PANEL / tile}× – above as is, below at 3× brightness`], 13),
    left: 0,
    top: LABEL + PANEL,
  });
  await sharp({ create: { width: totalWidth, height: totalHeight, channels: 3, background: "#07090c" } })
    .composite(composites)
    .png()
    .toFile(outFile);
  return {
    file: path.basename(outFile),
    crop: { x: crop.x, y: crop.y, size: tile },
    error: Object.fromEntries(decoded.map((c) => [c.codec, meanError(c.pixels)])),
  };
}
