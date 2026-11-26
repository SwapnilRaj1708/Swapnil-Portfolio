// Asset pipeline (PF-009): npm run asset -- <chapter>/<slug> [--review <ID>]
//
// Reads `Blender Assets/<chapter>/export/<slug>.glb` (the approved raw export; the assets folder is
// only read) and:
//   1. checks the asset contract (STANDARDS.md §6) – every violation listed at once, then it fails;
//      an unknown SHADER_ name is a loud warning;
//   2. checks the budgets (budgets.config.mjs `assets`: the slug's limits, else the chapter's);
//   3. cleans (dedup, prune; TANGENT only where a normal map needs it; empties, names, extras,
//      COLOR_0 and clips kept);
//   4. compresses geometry with Meshopt (EXT_meshopt_compression + KHR_mesh_quantization) and
//      textures to KTX2 with KTX-Software's `ktx` tool (D-43: v4.4.2 on PATH, or KTX_BIN);
//   5. writes `public/assets/<chapter>/<slug>/<slug>-high.glb` (full-size textures) and `-low.glb`
//      (textures at half size; geometry unchanged unless the slug's budget sets lowSimplify);
//   6. updates the generated manifest (src/lib/journey/assets/manifest.generated.ts) and the table
//      in docs/assets.md.
// Over budget or any failure: a clear message, exit code 1, and nothing written.
// --review <ID>: also writes texture comparisons (original vs chosen vs rejected encoding) into
// .review/<ID>/.

import path from "node:path";
import { budgets } from "../budgets.config.mjs";
import { runAssetPipeline } from "./lib/asset/pipeline.mjs";
import { ROOT } from "./lib/prod-server.mjs";

function parseArgs(argv) {
  const args = [...argv];
  let review = null;
  const i = args.indexOf("--review");
  if (i >= 0) {
    review = args[i + 1];
    if (!review || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(review)) throw new Error("--review needs an ID, e.g. --review PF-009");
    args.splice(i, 2);
  }
  const unknown = args.filter((a) => a.startsWith("--"));
  if (unknown.length) throw new Error(`unknown option ${unknown.join(" ")}`);
  if (args.length !== 1) throw new Error("usage: npm run asset -- <chapter>/<slug> [--review <ID>]   (e.g. shared/pipeline-test)");
  return { key: args[0], review };
}

const kb = (n) => `${(n / 1000).toFixed(1)} KB`;

async function main() {
  const { key, review } = parseArgs(process.argv.slice(2));
  console.log(`Asset pipeline: ${key}`);
  const result = await runAssetPipeline({
    key,
    repoRoot: ROOT,
    sourceRoot: path.join(ROOT, "Blender Assets"),
    outDir: path.join(ROOT, "public", "assets"),
    manifestFile: path.join(ROOT, "src", "lib", "journey", "assets", "manifest.generated.ts"),
    docsFile: path.join(ROOT, "docs", "assets.md"),
    budgets: budgets.assets,
    review: review ? { dir: path.join(ROOT, ".review", review) } : null,
    log: (line) => console.log(`  ${line}`),
  });

  for (const w of result.warnings) {
    console.warn(`\n  !!! WARNING !!! ${w}`);
  }
  if (!result.ok) {
    console.error(`\nFAILED – nothing was written. ${result.errors.length} problem(s):`);
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const { entry, report } = result;
  console.log(`\n${entry.key}: ${entry.triangles} triangles (${entry.trianglesDrawn} drawn), ${entry.objects} objects, ${entry.materials.length} materials, ${entry.clips.length} clip(s)`);
  console.log(`  raw ${kb(report.sourceBytes)} → high ${kb(entry.files.high.bytes)} · low ${kb(entry.files.low.bytes)}`);
  for (const t of entry.textures) {
    const cands = t.candidates.map((c) => `${c.codec.toUpperCase()} ${kb(c.bytes)} SSIM ${c.ssim.toFixed(4)} PSNR ${c.psnr.toFixed(1)} dB`).join(" | ");
    console.log(`  texture ${t.name} [${t.slots.join(", ")}] ${t.colorSpace}: ${cands} → ${t.codec.toUpperCase()}; high ${t.high.width}² ${kb(t.high.bytes)}, low ${t.low.width}² ${kb(t.low.bytes)}`);
  }
  for (const c of report.comparisons) console.log(`  review: .review/${review}/${c.file} (crop ${c.crop.size} px at ${c.crop.x},${c.crop.y}; mean error ${JSON.stringify(c.error)})`);
  console.log(`  empties: ${Object.entries(entry.empties).map(([k, v]) => `${k} ${v.length}`).join(", ")}; instances: ${entry.instances.map((i) => `${i.prop} × ${i.count}`).join(", ") || "none"}`);
  console.log(`  wrote public/assets/${entry.chapter}/${entry.slug}/${entry.files.high.file}, ${entry.files.low.file}; src/lib/journey/assets/manifest.generated.ts; docs/assets.md`);
}

main().catch((error) => {
  console.error(`\nFAILED – ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
