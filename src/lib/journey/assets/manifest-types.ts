import type { EmptyKind, MaterialKind } from "./contract-rules";

/**
 * One asset the pipeline wrote (`npm run asset -- <chapter>/<slug>`, scripts/asset.mjs). The
 * pipeline generates manifest.generated.ts from these; nothing edits it by hand.
 */

/** The two files every asset has: `high` (high and medium tiers) and `low` (low tier). */
export type AssetVariant = "high" | "low";

export type AssetFile = {
  /** File name inside `public/assets/<chapter>/<slug>/`. */
  file: string;
  /** Bytes on disk = bytes served (a .glb is not compressed again). */
  bytes: number;
  /** SHA-256 of the file (hex). */
  sha256: string;
};

export type AssetTexture = {
  /** The image's name in the export (its Blender image name). */
  name: string;
  /** The material slots that use it (`baseColorTexture`, `normalTexture` …). */
  slots: string[];
  /** `srgb` (base colour, bake, emission) or `linear` (normals, other data). */
  colorSpace: "srgb" | "linear";
  /** SHA-256 of the image's pixels (with its size and channels) – an unchanged image keeps its encoding. */
  pixelSha256: string;
  /** Hash of the encoder settings it was made with (tool version, flags, channels, role). */
  encodingKey: string;
  /** Basis Universal codec in the KTX2 file: `etc1s` (BasisLZ) or `uastc` (+ Zstandard). */
  codec: "etc1s" | "uastc";
  high: { width: number; height: number; bytes: number };
  low: { width: number; height: number; bytes: number };
  /** Every encoding tried on the high variant (colour images: both codecs), level-0 SSIM (lowest channel) and PSNR (dB). */
  candidates: { codec: "etc1s" | "uastc"; bytes: number; ssim: number; psnr: number }[];
};

export type AssetManifestEntry = {
  /** `<chapter>/<slug>`, the asset's id. */
  key: string;
  chapter: string;
  slug: string;
  /** The raw export it was made from (in the owner's assets folder; never in this repo). */
  source: { file: string; bytes: number; sha256: string };
  /** When the pipeline made these files from this source (YYYY-MM-DD). */
  date: string;
  licence: string;
  /** Triangles of each mesh once (as Blender counts them). */
  triangles: number;
  /** Triangles drawn: instanced props once per instance, their source never in place. */
  trianglesDrawn: number;
  /** Objects (nodes) in the export. */
  objects: number;
  materials: { name: string; kind: MaterialKind }[];
  textures: AssetTexture[];
  clips: { name: string; duration: number }[];
  /** Empties by prefix (node names). */
  empties: Record<EmptyKind, string[]>;
  /** Instanced props: `INST_<prop>_<nnn>` copies of the mesh `<chapter>_<prop>`. */
  instances: { prop: string; source: string; count: number }[];
  files: Record<AssetVariant, AssetFile>;
  /** Tools that made the files. */
  tools: { ktx: string; gltfTransform: string; meshoptimizer: string };
};
