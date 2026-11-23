// Stage 1 stills and icons (PF-028): npm run media:stills
//
// Reads the owner-approved Blender renders in `Blender Assets/stills/` (read only – D-22: this
// script never writes there) and writes the files the site ships:
//
//   public/media/stills/still-s1-<chapter>-wide.webp / -portrait.webp
//       Masters at full resolution, lossy WebP at high quality. They are never served as they are:
//       next/image resizes and re-encodes them (AVIF, else WebP, quality 75) for each device.
//   public/media/stills/still-social.jpg
//       1200 × 630 background of the social images (src/lib/social-image.tsx). JPEG because the
//       social-image renderer (next/og) reads PNG and JPEG, not WebP.
//   src/app/favicon.ico            16, 32 and 48 px (PNG inside ICO), from the transparent mark
//   src/app/icon1.png, icon2.png   192 and 512 px app icons (manifest), from the mark on #07090C
//   src/app/apple-icon.png         180 px apple-touch icon, from the mark on #07090C
//
// Budget (PF-028): every variant next/image can serve must be ≤ 250 KB at the largest size the
// layout uses. The stills are drawn full-bleed (`sizes="100vw"`), so on a large or high-density
// screen the browser asks for the widest variant, which next/image caps at the master's own width
// (it never enlarges). The script therefore encodes each master the way next/image does (same
// encoder, same settings: AVIF quality 47 effort 3, WebP quality 75) at full width and fails
// (exit 1, nothing written) if either is over the limit. `npm run size` measures the real served
// bytes from a running build.
//
// Usage: npm run media:stills            (writes everything)
//        npm run media:stills -- --check (encodes and checks only, writes nothing)

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "Blender Assets", "stills");
const STILLS_OUT = path.join(ROOT, "public", "media", "stills");
const APP = path.join(ROOT, "src", "app");

const MAX_SERVED_BYTES = 250_000;
/** Master quality: high enough that next/image's re-encode at 75 shows no master artefacts. */
const MASTER_WEBP = { quality: 90, effort: 6, smartSubsample: true };
/** What next/image 16 does (node_modules/next/dist/server/image-optimizer/transform.js). */
const SERVED = { avif: { quality: Math.round(75 * (50 / 80)), effort: 3 }, webp: { quality: 75 } };

/** Approved stills (REPORT-stills.md, runs 1 and 2) and their expected pixel sizes. */
const STILLS = [
  { chapter: "port", wide: [2560, 1440], portrait: [1080, 1920] },
  { chapter: "bus", wide: [2560, 1080], portrait: [1080, 1350] },
  { chapter: "memory", wide: [2560, 1080], portrait: [1080, 1350] },
  { chapter: "array", wide: [2560, 1080], portrait: [1080, 1350] },
  { chapter: "core", wide: [2560, 1080], portrait: [1080, 1350] },
  { chapter: "uplink", wide: [2560, 1080], portrait: [1080, 1350] },
];

const check = process.argv.includes("--check");
const kb = (n) => `${(n / 1000).toFixed(1)} KB`;
const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 12);
const failures = [];
/** [path, bytes] – written only after every check passed. */
const outputs = [];

async function source(name, [w, h] = []) {
  const file = path.join(SOURCE, name);
  const buf = await readFile(file);
  const meta = await sharp(buf).metadata();
  if (w && (meta.width !== w || meta.height !== h)) {
    failures.push(`${name}: expected ${w}×${h}, found ${meta.width}×${meta.height}`);
  }
  return { buf, meta };
}

/** Mean absolute difference per channel (0–255) between the master and the source. */
async function meanError(a, b) {
  const [x, y] = await Promise.all([a, b].map((img) => sharp(img).removeAlpha().raw().toBuffer()));
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += Math.abs(x[i] - y[i]);
  return sum / x.length;
}

async function encodeStills() {
  console.log("Stills: master → largest served variant (next/image settings)");
  for (const still of STILLS) {
    for (const crop of ["wide", "portrait"]) {
      const name = `still-s1-${still.chapter}-${crop}`;
      const { buf, meta } = await source(`${name}.png`, still[crop]);
      const master = await sharp(buf).webp(MASTER_WEBP).toBuffer();
      const [avif, webp] = await Promise.all([
        sharp(master).resize(meta.width, undefined, { withoutEnlargement: true }).avif(SERVED.avif).toBuffer(),
        sharp(master).resize(meta.width, undefined, { withoutEnlargement: true }).webp(SERVED.webp).toBuffer(),
      ]);
      const err = await meanError(buf, master);
      for (const [fmt, out] of [["AVIF", avif], ["WebP", webp]]) {
        if (out.length > MAX_SERVED_BYTES) failures.push(`${name}: served ${fmt} at ${meta.width} px is ${kb(out.length)} > ${kb(MAX_SERVED_BYTES)}`);
      }
      console.log(
        `  ${name.padEnd(28)} ${meta.width}×${meta.height}  source ${kb(buf.length).padStart(9)}  master ${kb(master.length).padStart(8)}` +
          `  (mean error ${err.toFixed(2)}/255)  served AVIF ${kb(avif.length).padStart(8)}  WebP ${kb(webp.length).padStart(8)}  sha ${sha(master)}`,
      );
      outputs.push([path.join(STILLS_OUT, `${name}.webp`), master]);
    }
  }

  const { buf } = await source("still-social.png", [2400, 1260]);
  const social = await sharp(buf).resize(1200, 630, { kernel: "lanczos3" }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  console.log(`  ${"still-social".padEnd(28)} 2400×1260 → 1200×630 JPEG ${kb(social.length)}  sha ${sha(social)}`);
  outputs.push([path.join(STILLS_OUT, "still-social.jpg"), social]);
}

/** ICO with PNG-compressed images (supported by every current browser and Windows since Vista). */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, png } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette colours
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.png)]);
}

async function encodeIcons() {
  console.log("Icons");
  const { buf: opaque } = await source("icon-mark.png", [1024, 1024]);
  const { buf: transparent } = await source("icon-mark-transparent.png", [1024, 1024]);

  // Favicon: the transparent mark, trimmed to the housing so the mark fills the small square
  // (with the 12 % render padding it would be about 12 px wide at 16 px).
  const trimmed = await sharp(transparent).trim().toBuffer();
  const favicon = ico(
    await Promise.all(
      [16, 32, 48].map(async (size) => ({
        size,
        png: await sharp(trimmed)
          .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" })
          .png({ compressionLevel: 9 })
          .toBuffer(),
      })),
    ),
  );
  outputs.push([path.join(APP, "favicon.ico"), favicon]);
  console.log(`  favicon.ico (16, 32, 48)  ${kb(favicon.length)}`);

  for (const [file, size] of [
    ["icon1.png", 192],
    ["icon2.png", 512],
    ["apple-icon.png", 180],
  ]) {
    const png = await sharp(opaque).resize(size, size, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toBuffer();
    outputs.push([path.join(APP, file), png]);
    console.log(`  ${file.padEnd(14)} ${size}×${size}  ${kb(png.length)}`);
  }
}

try {
  await encodeStills();
  await encodeIcons();
} catch (err) {
  failures.push(err?.message ?? String(err));
}

if (failures.length) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  console.error("Nothing was written.");
  process.exit(1);
}
if (check) {
  console.log("--check: all within limits; nothing written.");
} else {
  await mkdir(STILLS_OUT, { recursive: true });
  for (const [file, buf] of outputs) await writeFile(file, buf);
  console.log(`Wrote ${outputs.length} files (public/media/stills/, src/app/ icons).`);
}
