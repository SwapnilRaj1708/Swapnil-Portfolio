// Decoders and transcoders served by the site itself (PF-009, STANDARDS.md §4). Runs before every
// build and `next dev` (npm `prebuild` / `predev`), and as `npm run decoders`.
//
// Copies, from the INSTALLED three.js, into public/decoders/three-r<REVISION>/:
//   basis/basis_transcoder.js, basis/basis_transcoder.wasm   (Basis Universal, for KTX2Loader)
//   meshopt_decoder.module.js                                 (Meshopt; its WASM is inside the file)
// The folder carries three's REVISION, and the site asks for `/decoders/three-r${REVISION}/` with
// REVISION imported from the same three.js (src/components/journey/assets/decoders.ts), so the
// files can never be from another three.js version than the code that loads them. Copies of other
// revisions are removed. The folder is generated, never committed (.gitignore).
//
// Where the 3D layer is not built in (the Vercel production deployment until PF-026, D-39), the
// folder is removed instead, so the live site serves no decoder at all.

import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { REVISION } from "three";
import { isJourneyEnabled, JOURNEY_LAUNCHED } from "../src/config/journey.ts";
import { ROOT } from "./lib/prod-server.mjs";

const DECODERS = path.join(ROOT, "public", "decoders");
const LIBS = path.join(ROOT, "node_modules", "three", "examples", "jsm", "libs");
export const DECODER_FILES = [
  ["basis/basis_transcoder.js", "basis/basis_transcoder.js"],
  ["basis/basis_transcoder.wasm", "basis/basis_transcoder.wasm"],
  ["meshopt_decoder.module.js", "meshopt_decoder.module.js"],
];

async function same(a, b) {
  if (!existsSync(b)) return false;
  const [x, y] = await Promise.all([readFile(a), readFile(b)]);
  return Buffer.compare(x, y) === 0;
}

async function main() {
  if (!isJourneyEnabled(JOURNEY_LAUNCHED, process.env.VERCEL_ENV)) {
    await rm(DECODERS, { recursive: true, force: true });
    console.log("decoders: this build has no 3D layer (D-39) – public/decoders/ removed");
    return;
  }
  const folder = `three-r${REVISION}`;
  const target = path.join(DECODERS, folder);
  if (existsSync(DECODERS)) {
    for (const entry of await readdir(DECODERS)) {
      if (entry !== folder) await rm(path.join(DECODERS, entry), { recursive: true, force: true });
    }
  }
  let copied = 0;
  for (const [from, to] of DECODER_FILES) {
    const source = path.join(LIBS, from);
    const dest = path.join(target, to);
    if (!existsSync(source)) throw new Error(`three.js r${REVISION} has no ${from} (node_modules/three/examples/jsm/libs)`);
    if (await same(source, dest)) continue;
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(source, dest);
    copied++;
  }
  console.log(`decoders: public/decoders/${folder}/ ${copied ? `– ${copied} file(s) copied from three r${REVISION}` : "up to date"}`);
}

main().catch((error) => {
  console.error(`decoders: FAILED – ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
