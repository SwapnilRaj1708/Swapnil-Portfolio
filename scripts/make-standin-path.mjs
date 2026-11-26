// npm run path:standin
//
// Writes the stand-in journey camera path (PF-008) to public/assets/world/: world-path.glb (camera
// `CAM_journey`, clip `journey`, 30 fps, 12 s) and world-path.json (fps, first and last frame, the
// CH_ marker of each chapter). Code-generated plumbing until PF-010 exports the real path from
// Blender into the same two files; replacing them needs no code change. See scripts/lib/standin-path.mjs
// and docs/assets.md.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStandinPath } from "./lib/standin-path.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Must match JOURNEY_PATH_DIR in src/components/journey/scene/path-asset.ts. */
const OUT_DIR = path.join(ROOT, "public", "assets", "world");

const { glb, json } = buildStandinPath();
await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, "world-path.glb"), glb);
await writeFile(path.join(OUT_DIR, "world-path.json"), `${JSON.stringify(json, null, 2)}\n`);
console.log(`wrote public/assets/world/world-path.glb (${glb.length} bytes) and world-path.json`);
console.log(`  ${json.fps} fps, frames ${json.firstFrame}–${json.lastFrame}, markers ${Object.entries(json.markers).map(([k, v]) => `${k} ${v}`).join(", ")}`);
