// Encoder settings of the asset pipeline (PF-009). Budgets live in budgets.config.mjs; these are
// the choices of HOW to compress, measured on the contract test piece (pipeline-test, 2026-11-26):
//
//   bake (1024², dark gradients)  ETC1S q255: 39.1 KB, level-0 SSIM 0.983 / 0.998 / 0.983, PSNR 53.6 dB –
//                                 visible green/blue contour banding across the smooth gradients;
//                                 UASTC q2 + RDO λ1 + Zstd 18: 195.8 KB, SSIM ≥ 0.9997, PSNR 57.6 dB.
//   normal map (512²)            UASTC q2 + RDO λ0.5 + Zstd 18: 79.2 KB (SSIM ≥ 0.995) vs 108.3 KB without RDO.
//
// PSNR hides the banding (dark images have small absolute errors); per-channel SSIM shows it. So a
// colour image is encoded both ways and ETC1S is kept only when it is close to transparent: its
// level-0 SSIM at least MIN_ETC1S_SSIM in every channel. Otherwise UASTC.

/** Flags every encode gets: full mip chain (repeat-wrapped like the glTF samplers), deterministic output. */
export const COMMON_FLAGS = ["--generate-mipmap", "--mipmap-wrap", "wrap", "--testrun", "--threads", "1"];

/** Quality numbers printed by ktx for every encode (parsed, recorded in the manifest and docs). */
export const COMPARE_FLAGS = ["--compare-ssim", "--compare-psnr"];

export const CODEC_FLAGS = {
  /** BasisLZ (ETC1S): smallest; banding on smooth dark gradients. */
  etc1s: ["--encode", "basis-lz", "--clevel", "4", "--qlevel", "255"],
  /** UASTC with rate-distortion optimisation, supercompressed with Zstandard. */
  uastc: ["--encode", "uastc", "--uastc-quality", "2", "--uastc-rdo", "--uastc-rdo-l", "1", "--uastc-rdo-m", "--zstd", "18"],
  /** Normal maps: UASTC, a lower RDO λ (KTX-Software's advice for normals: 0.25–0.75). */
  uastcNormal: ["--encode", "uastc", "--uastc-quality", "2", "--uastc-rdo", "--uastc-rdo-l", "0.5", "--uastc-rdo-m", "--zstd", "18"],
};

/** ETC1S is chosen for a colour image only if its level-0 SSIM reaches this in every channel. */
export const MIN_ETC1S_SSIM = 0.995;

/** The licence recorded for every asset made from the owner's Blender work. */
export const ASSET_LICENCE = "owner, all rights reserved";

/** The KTX tool: KTX-Software's `ktx`, stable release, at least this version (D-43 installs v4.4.2). */
export const KTX_MIN_VERSION = [4, 3, 0];
