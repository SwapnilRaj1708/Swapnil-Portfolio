// KTX2 texture compression with the installed `ktx` tool (D-43). Each image is normalised with sharp
// (8-bit PNG, alpha dropped when fully opaque – no colour conversion), then encoded:
//
//   normal maps                         UASTC + Zstd, linear (CODEC_FLAGS.uastcNormal)
//   colour (base colour, bake, emission) ETC1S and UASTC both, sRGB; ETC1S kept only if its level-0
//                                        SSIM ≥ MIN_ETC1S_SSIM in every channel, else UASTC
//   other data (roughness, occlusion …) UASTC + Zstd, linear
//
// `high` keeps the full size; `low` halves each side (ktx resamples with its mip filter, in linear
// light for sRGB images). The low variant reuses the high variant's codec choice.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { KHRTextureBasisu } from "@gltf-transform/extensions";
import { getTextureColorSpace, listTextureSlots } from "@gltf-transform/functions";
import sharp from "sharp";
import { parseCompare, runKtx } from "./ktx.mjs";
import { CODEC_FLAGS, COMMON_FLAGS, COMPARE_FLAGS, MIN_ETC1S_SSIM } from "./settings.mjs";

const safe = (name) => name.replace(/[^A-Za-z0-9_-]+/g, "_");

/**
 * Normalises an image to a plain 8-bit PNG holding exactly the stored pixel values: the embedded
 * colour profile is ignored (Blender writes iCCP/cICP/gAMA chunks; the values are what count – the
 * colour space comes from the material slot), alpha dropped when fully opaque, metadata stripped.
 * Throws if the written file's pixels differ from the source's. Returns its path, size and channels.
 */
async function preparePng(bytes, file) {
  const decode = (input) => sharp(input, { ignoreIcc: true });
  const meta = await decode(bytes).metadata();
  if ((meta.depth ?? "uchar") !== "uchar") throw new Error(`image is ${meta.depth}; 8-bit PNG expected`);
  let channels = meta.channels ?? 3;
  let image = decode(bytes);
  if (meta.hasAlpha) {
    const stats = await decode(bytes).stats();
    if (stats.channels[stats.channels.length - 1].min === 255) {
      image = image.removeAlpha();
      channels -= 1;
    }
  }
  const png = await image.png({ compressionLevel: 9 }).toBuffer();
  const [source, written] = await Promise.all([
    (channels < (meta.channels ?? 3) ? decode(bytes).removeAlpha() : decode(bytes)).raw().toBuffer(),
    decode(png).raw().toBuffer(),
  ]);
  if (Buffer.compare(source, written) !== 0) throw new Error("normalising the PNG changed its pixel values");
  await writeFile(file, png);
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const pixelSha256 = createHash("sha256").update(`${width}x${height}x${channels}:`).update(source).digest("hex");
  return { file, width, height, channels, pixelSha256 };
}

/** Identifies everything that decides an encoding besides the pixels: tool, flags, channels, colour space, role. */
function encodingKey({ ktxVersion, channels, colorSpace, isNormal }) {
  const settings = { ktxVersion, COMMON_FLAGS, CODEC_FLAGS, MIN_ETC1S_SSIM, channels, colorSpace, isNormal };
  return createHash("sha256").update(JSON.stringify(settings)).digest("hex").slice(0, 16);
}

function formatFlags(channels, colorSpace) {
  const layout = channels >= 4 ? "R8G8B8A8" : channels === 3 ? "R8G8B8" : channels === 2 ? "R8G8" : "R8";
  return colorSpace === "srgb" ? ["--format", `${layout}_SRGB`, "--assign-tf", "srgb"] : ["--format", `${layout}_UNORM`, "--assign-tf", "linear"];
}

async function encode(ktx, input, output, { channels, colorSpace, codecFlags, size }) {
  const sizeFlags = size ? ["--width", String(size.width), "--height", String(size.height)] : [];
  const stdout = await runKtx(ktx.bin, ["create", ...formatFlags(channels, colorSpace), ...sizeFlags, ...COMMON_FLAGS, ...COMPARE_FLAGS, ...codecFlags, input, output]);
  const bytes = await readFile(output);
  const quality = parseCompare(stdout);
  return { bytes, quality: quality ? { ssim: round(quality.ssim, 6), psnr: round(quality.psnr, 2) } : null };
}

const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;

/**
 * Replaces every texture of the document with KTX2 (KHR_texture_basisu). `decisions` maps a
 * texture name to the codec the high variant chose (filled in on `high`, read on `low`).
 *
 * `reuse` (name → { pixelSha256, encodingKey, codec, candidates, bytes: { high, low } }) holds the
 * encodings already published for this asset: an image whose pixels and encoding settings are
 * unchanged keeps its published KTX2 bytes instead of being encoded again. KTX-Software's UASTC
 * rate-distortion optimisation is not bit-exact from run to run (measured: 1 encode in 16 of the
 * pipeline-test bake differed by 16 bytes in level 0, with --threads 1 and --uastc-rdo-m), so this
 * is what makes a re-run on an unchanged export byte-identical. `review` encodes the candidates even
 * when reusing, for the comparison images.
 *
 * Returns one record per texture; `candidates[].file` are the encoded candidates (when encoded).
 */
export async function encodeTextures(document, { ktx, variant, decisions, workDir, reuse = new Map(), review = false }) {
  const textures = document.getRoot().listTextures();
  if (!textures.length) return [];
  await mkdir(workDir, { recursive: true });
  const results = [];
  for (const texture of textures) {
    const name = texture.getName() || `texture_${results.length}`;
    const base = path.join(workDir, `${safe(name)}-${variant}`);
    const slots = listTextureSlots(texture).sort();
    const colorSpace = getTextureColorSpace(texture) === "srgb" ? "srgb" : "linear";
    const isNormal = slots.includes("normalTexture");
    const png = await preparePng(texture.getImage(), `${base}.png`);
    const size = variant === "low" ? { width: Math.max(1, png.width / 2), height: Math.max(1, png.height / 2) } : null;
    const width = size?.width ?? png.width;
    const height = size?.height ?? png.height;
    const options = { channels: png.channels, colorSpace, size };
    const key = encodingKey({ ktxVersion: ktx.version, channels: png.channels, colorSpace, isNormal });
    const published = reuse.get(name);
    const unchanged = published && published.pixelSha256 === png.pixelSha256 && published.encodingKey === key && published.bytes[variant];

    let chosen;
    const candidates = [];
    if (unchanged && !(review && variant === "high")) {
      chosen = { codec: published.codec, bytes: published.bytes[variant] };
      if (variant === "high") candidates.push(...published.candidates);
      else candidates.push({ codec: published.codec, bytes: published.bytes.low.length, ...(published.lowQuality ?? { ssim: 0, psnr: 0 }) });
      decisions.set(name, published.codec);
    } else if (!isNormal && colorSpace === "srgb" && variant === "high") {
      const etc1s = await encode(ktx, png.file, `${base}-etc1s.ktx2`, { ...options, codecFlags: CODEC_FLAGS.etc1s });
      const uastc = await encode(ktx, png.file, `${base}-uastc.ktx2`, { ...options, codecFlags: CODEC_FLAGS.uastc });
      candidates.push(
        { codec: "etc1s", bytes: etc1s.bytes.length, ...(etc1s.quality ?? { ssim: 0, psnr: 0 }), file: `${base}-etc1s.ktx2` },
        { codec: "uastc", bytes: uastc.bytes.length, ...(uastc.quality ?? { ssim: 0, psnr: 0 }), file: `${base}-uastc.ktx2` },
      );
      const etc1sGood = (etc1s.quality?.ssim ?? 0) >= MIN_ETC1S_SSIM;
      chosen = etc1sGood ? { codec: "etc1s", ...etc1s } : { codec: "uastc", ...uastc };
      decisions.set(name, chosen.codec);
    } else {
      const codec = isNormal || colorSpace === "linear" ? "uastc" : (decisions.get(name) ?? "uastc");
      const codecFlags = isNormal ? CODEC_FLAGS.uastcNormal : CODEC_FLAGS[codec];
      const encoded = await encode(ktx, png.file, `${base}-${codec}.ktx2`, { ...options, codecFlags });
      chosen = { codec, ...encoded };
      candidates.push({ codec, bytes: encoded.bytes.length, ...(encoded.quality ?? { ssim: 0, psnr: 0 }), file: `${base}-${codec}.ktx2` });
      if (variant === "high") decisions.set(name, codec);
    }
    if (unchanged) {
      // Review encodes ran for the comparison only: the published bytes and numbers stay.
      chosen = { codec: published.codec, bytes: published.bytes[variant] };
      if (variant === "high" && review) {
        for (const c of candidates) Object.assign(c, published.candidates.find((p) => p.codec === c.codec) ?? {});
      }
    }
    texture.setImage(new Uint8Array(chosen.bytes)).setMimeType("image/ktx2");
    if (texture.getURI()) texture.setURI(texture.getURI().replace(/\.[a-z0-9]+$/i, ".ktx2"));
    results.push({
      name,
      slots,
      colorSpace,
      codec: chosen.codec,
      width,
      height,
      bytes: chosen.bytes.length,
      candidates,
      sourcePng: png.file,
      pixelSha256: png.pixelSha256,
      encodingKey: key,
      reused: !!unchanged,
    });
  }
  document.createExtension(KHRTextureBasisu).setRequired(true);
  return results;
}
