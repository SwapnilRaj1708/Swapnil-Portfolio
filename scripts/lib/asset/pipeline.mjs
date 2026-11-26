// The asset pipeline (PF-009): one raw Blender export in, a budget-checked, compressed site asset
// with high and low variants out, the manifest and docs/assets.md updated. See scripts/asset.mjs
// for the command and docs/assets.md for the steps.
//
// Nothing is written unless every step succeeds: the variants are built in a temporary folder, the
// manifest and the docs are rendered in memory, and only then is everything moved into place.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Logger, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { cloneDocument } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { CHAPTER_IDS } from "../../../src/lib/journey/chapters.ts";
import { isAssetSlug, SHARED_CHAPTER } from "../../../src/lib/journey/assets/contract-rules.ts";
import { SHADER_NAMES } from "../../../src/lib/journey/assets/shader-names.ts";
import { checkInputBudget, checkOutputBudget, resolveBudget } from "./budget.mjs";
import { validateContract } from "./contract.mjs";
import { cleanDocument, compressGeometry } from "./geometry.mjs";
import { measureDocument, readGlbJson } from "./inspect.mjs";
import { findKtx } from "./ktx.mjs";
import { parseManifest, renderDocsTable, renderManifest, updateDocs } from "./manifest.mjs";
import { writeTextureComparison } from "./review.mjs";
import { ASSET_LICENCE } from "./settings.mjs";
import { encodeTextures } from "./textures.mjs";

export const ASSET_CHAPTERS = [...CHAPTER_IDS, SHARED_CHAPTER];
const VARIANTS = /** @type {const} */ (["high", "low"]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function packageVersion(root, name) {
  try {
    return JSON.parse(await readFile(path.join(root, "node_modules", name, "package.json"), "utf8")).version;
  } catch {
    return "unknown";
  }
}

export async function createIO() {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
}

/** `<chapter>/<slug>` → its parts, or an error. */
export function parseAssetKey(key) {
  const m = /^([a-z0-9]+)\/([^/]+)$/.exec(key ?? "");
  if (!m) return { error: `"${key ?? ""}": expected <chapter>/<slug>, e.g. shared/pipeline-test` };
  const [, chapter, slug] = m;
  if (!ASSET_CHAPTERS.includes(chapter)) return { error: `chapter "${chapter}": one of ${ASSET_CHAPTERS.join(", ")}` };
  if (!isAssetSlug(slug)) return { error: `slug "${slug}": lower-case words joined by hyphens` };
  return { chapter, slug };
}

/**
 * The KTX2 encodings already published for an asset: texture name → pixels and settings it was
 * made from, its codec and numbers, and its bytes per variant. Only from files whose SHA-256 still
 * matches the manifest (a hand-edited or missing file is never reused).
 */
async function publishedEncodings(io, prior, folder) {
  const reuse = new Map();
  if (!prior) return reuse;
  const bytesByVariant = {};
  for (const variant of VARIANTS) {
    const file = path.join(folder, prior.files[variant].file);
    if (!existsSync(file)) return reuse;
    const data = new Uint8Array(await readFile(file));
    if (sha256(data) !== prior.files[variant].sha256) return reuse;
    const doc = await io.readBinary(data);
    bytesByVariant[variant] = new Map(doc.getRoot().listTextures().map((t) => [t.getName(), t.getImage()]));
  }
  for (const t of prior.textures) {
    const high = bytesByVariant.high.get(t.name);
    const low = bytesByVariant.low.get(t.name);
    if (!high || !low || !t.pixelSha256 || !t.encodingKey) continue;
    reuse.set(t.name, { pixelSha256: t.pixelSha256, encodingKey: t.encodingKey, codec: t.codec, candidates: t.candidates ?? [], bytes: { high, low } });
  }
  return reuse;
}

/** What the variant still has to hold after compression: the contract's names, intact. */
function contractFingerprint(stats) {
  return JSON.stringify({ materials: stats.materials, empties: stats.empties, instances: stats.instances, clips: stats.clips.map((c) => c.name), triangles: stats.triangles });
}

/**
 * Runs the pipeline. Paths (all absolute):
 *   sourceRoot  the assets folder (`Blender Assets/`), read only: <chapter>/export/<slug>.glb
 *   outDir      where asset folders go (`public/assets/`): <chapter>/<slug>/<slug>-high.glb, -low.glb
 *   manifestFile, docsFile   the generated manifest module and docs/assets.md
 * `today` gives the date for a new or changed source; `review` = { dir } writes texture comparisons.
 * Returns { ok, errors, warnings, entry?, report }.
 */
export async function runAssetPipeline(options) {
  const { key, sourceRoot, outDir, manifestFile, docsFile, budgets, repoRoot, review = null, log = () => {} } = options;
  const today = options.today ?? (() => new Date().toISOString().slice(0, 10));
  const parsed = parseAssetKey(key);
  if (parsed.error) return { ok: false, errors: [parsed.error], warnings: [] };
  const { chapter, slug } = parsed;
  const sourceFile = path.join(sourceRoot, chapter, "export", `${slug}.glb`);
  if (!existsSync(sourceFile)) return { ok: false, errors: [`no raw export at ${sourceFile}`], warnings: [] };

  const raw = new Uint8Array(await readFile(sourceFile));
  let json;
  let document;
  const io = await createIO();
  try {
    json = readGlbJson(raw);
    document = await io.readBinary(raw);
    // gltf-transform's own messages: warnings and errors only (its info lines are noise here).
    document.setLogger(new Logger(Logger.Verbosity.WARN));
  } catch (error) {
    return { ok: false, errors: [`${path.basename(sourceFile)}: could not be read – ${/** @type {Error} */ (error).message}`], warnings: [] };
  }

  // 1. Contract and input budgets: every problem at once.
  const contract = validateContract({ json, document, chapter, shaderNames: SHADER_NAMES });
  const stats = measureDocument(document, chapter);
  const budget = resolveBudget(budgets, chapter, slug);
  const errors = [...contract.errors, ...checkInputBudget(stats, budget)];
  const warnings = [...contract.warnings];
  if (errors.length) return { ok: false, errors, warnings, stats };

  const ktx = document.getRoot().listTextures().length ? await findKtx(options.ktxBin).catch((e) => ({ error: e.message })) : null;
  if (ktx && "error" in ktx) return { ok: false, errors: [ktx.error], warnings, stats };

  const work = await mkdtemp(path.join(os.tmpdir(), `asset-${slug}-`));
  try {
    // 2. Clean once; both variants start from the cleaned document.
    const cleaned = await cleanDocument(document);
    log(`cleaned: dedup, prune, TANGENT removed from ${cleaned.tangentsStripped} primitive(s) without a normal map`);

    // 3. Variants: textures (KTX2), geometry (Meshopt), written to the work folder. Images whose
    //    pixels and encoding settings match the published files keep their published encoding.
    const manifestText = existsSync(manifestFile) ? await readFile(manifestFile, "utf8") : null;
    const previous = manifestText ? parseManifest(manifestText) : [];
    const prior = previous.find((e) => e.key === `${chapter}/${slug}`);
    const reuse = ktx ? await publishedEncodings(io, prior, path.join(outDir, chapter, slug)) : new Map();
    const decisions = new Map();
    const variants = {};
    for (const variant of VARIANTS) {
      const doc = cloneDocument(document);
      const textures = ktx
        ? await encodeTextures(doc, { ktx, variant, decisions, workDir: path.join(work, "textures"), reuse, review: !!review })
        : [];
      await compressGeometry(doc, { simplifyLow: variant === "low" ? budget.budget.lowSimplify || null : null });
      const bytes = await io.writeBinary(doc);
      // The variant must still carry the contract: read it back and compare names and counts.
      const check = measureDocument(await io.readBinary(bytes), chapter);
      const expected = variant === "low" && budget.budget.lowSimplify ? null : contractFingerprint(stats);
      const got = contractFingerprint(check);
      if (expected !== null && got !== expected) {
        return { ok: false, errors: [`${variant}: the compressed file lost part of the contract (names, empties, instances, clips or triangles changed)`], warnings, stats };
      }
      const file = `${slug}-${variant}.glb`;
      await writeFile(path.join(work, file), bytes);
      variants[variant] = { file, bytes: bytes.byteLength, sha256: sha256(bytes), textures };
      log(`${variant}: ${file} ${bytes.byteLength} B`);
    }

    // 4. Output budgets (texture sides per tier, the chapter's download per tier).
    const others = previous.filter((e) => e.chapter === chapter && e.key !== `${chapter}/${slug}`);
    const outputErrors = checkOutputBudget(
      {
        textureSides: Object.fromEntries(VARIANTS.map((v) => [v, variants[v].textures])),
        bytes: { high: variants.high.bytes, low: variants.low.bytes },
        chapterOtherBytes: {
          high: others.reduce((s, e) => s + e.files.high.bytes, 0),
          low: others.reduce((s, e) => s + e.files.low.bytes, 0),
        },
      },
      budget,
    );
    if (outputErrors.length) return { ok: false, errors: outputErrors, warnings, stats };

    // 5. The manifest entry; the date stays while the source is unchanged (re-runs are identical).
    const sourceSha = sha256(raw);
    const tools = {
      ktx: ktx?.version ?? "not used",
      gltfTransform: await packageVersion(repoRoot, "@gltf-transform/core"),
      meshoptimizer: await packageVersion(repoRoot, "meshoptimizer"),
    };
    const entry = {
      key: `${chapter}/${slug}`,
      chapter,
      slug,
      source: { file: `${chapter}/export/${slug}.glb`, bytes: raw.byteLength, sha256: sourceSha },
      date: prior && prior.source.sha256 === sourceSha ? prior.date : today(),
      licence: ASSET_LICENCE,
      triangles: stats.triangles,
      trianglesDrawn: stats.trianglesDrawn,
      objects: stats.objects,
      materials: stats.materials,
      textures: variants.high.textures.map((t) => {
        const low = variants.low.textures.find((l) => l.name === t.name);
        return {
          name: t.name,
          slots: t.slots,
          colorSpace: t.colorSpace,
          pixelSha256: t.pixelSha256,
          encodingKey: t.encodingKey,
          codec: t.codec,
          high: { width: t.width, height: t.height, bytes: t.bytes },
          low: { width: low?.width ?? 0, height: low?.height ?? 0, bytes: low?.bytes ?? 0 },
          candidates: t.candidates.map(({ codec, bytes, ssim, psnr }) => ({ codec, bytes, ssim, psnr })),
        };
      }),
      clips: stats.clips,
      empties: stats.empties,
      instances: stats.instances,
      files: Object.fromEntries(VARIANTS.map((v) => [v, { file: variants[v].file, bytes: variants[v].bytes, sha256: variants[v].sha256 }])),
      tools,
    };
    const entries = [...previous.filter((e) => e.key !== entry.key), entry];
    const manifestOut = renderManifest(entries);
    const docsIn = await readFile(docsFile, "utf8");
    const docsOut = updateDocs(docsIn, renderDocsTable(entries));

    // 6. Review comparisons (optional; outside the repo's tracked files).
    const comparisons = [];
    if (review && ktx) {
      await mkdir(review.dir, { recursive: true });
      for (const t of variants.high.textures) {
        if (t.candidates.length < 2) continue;
        const outFile = path.join(review.dir, `texture-compare-${t.name}.png`);
        comparisons.push({ texture: t.name, ...(await writeTextureComparison({ ktx, texture: t, outFile })) });
      }
    }

    // 7. Into place: the asset folder swapped in whole, then the manifest and the docs.
    const target = path.join(outDir, chapter, slug);
    const staging = path.join(outDir, chapter, `.${slug}.staging`);
    const old = path.join(outDir, chapter, `.${slug}.old`);
    await rm(staging, { recursive: true, force: true });
    await rm(old, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    for (const v of VARIANTS) await cp(path.join(work, variants[v].file), path.join(staging, variants[v].file));
    if (existsSync(target)) await rename(target, old);
    await rename(staging, target);
    await rm(old, { recursive: true, force: true });
    await writeFile(manifestFile, manifestOut);
    await writeFile(docsFile, docsOut);

    return {
      ok: true,
      errors: [],
      warnings,
      stats,
      entry,
      report: { sourceBytes: raw.byteLength, variants: Object.fromEntries(VARIANTS.map((v) => [v, { bytes: variants[v].bytes, textures: variants[v].textures }])), comparisons, tangentsStripped: cleaned.tangentsStripped },
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
