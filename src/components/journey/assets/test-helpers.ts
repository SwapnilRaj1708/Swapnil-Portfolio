import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Mesh, type BufferGeometry, type Object3D, type Texture } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { budgets } from "../../../../budgets.config.mjs";
import { fixtureGlb } from "../../../../scripts/lib/asset/fixtures.mjs";
import { DOCS_END, DOCS_START, renderManifest } from "../../../../scripts/lib/asset/manifest.mjs";
import { runAssetPipeline } from "../../../../scripts/lib/asset/pipeline.mjs";
import type { AssetManifestEntry } from "@/lib/journey/assets/manifest-types";
import { texturesOf } from "./contract";

/**
 * Test helpers for the loaders (unit tests only; nothing here is imported by the site):
 *   pipelineFixture()   the pipeline's real output for the fixture piece (Meshopt, quantized):
 *                       both variants' bytes and the manifest entry;
 *   loader()            GLTFLoader with three's Meshopt decoder (no KTX2: the fixture has no textures);
 *   memoryCounter()     counts geometries and textures "uploaded" and drops them on their `dispose`
 *                       event – what three's WebGLGeometries / WebGLTextures do with renderer.info.memory.
 */

export async function pipelineFixture(): Promise<{ entry: AssetManifestEntry; high: ArrayBuffer; low: ArrayBuffer }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "loader-fixture-"));
  try {
    const sourceRoot = path.join(root, "src");
    await mkdir(path.join(sourceRoot, "shared", "export"), { recursive: true });
    await writeFile(path.join(sourceRoot, "shared", "export", "loader-test.glb"), await fixtureGlb());
    const manifestFile = path.join(root, "manifest.ts");
    const docsFile = path.join(root, "assets.md");
    await writeFile(manifestFile, renderManifest([]));
    await writeFile(docsFile, `${DOCS_START}\n${DOCS_END}\n`);
    const outDir = path.join(root, "out");
    const result = await runAssetPipeline({ key: "shared/loader-test", repoRoot: process.cwd(), sourceRoot, outDir, manifestFile, docsFile, budgets: budgets.assets, today: () => "2026-11-26" });
    if (!result.ok) throw new Error(result.errors.join("\n"));
    const read = async (file: string) => {
      const b = await readFile(path.join(outDir, "shared", "loader-test", file));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    };
    const entry = result.entry as AssetManifestEntry;
    return { entry, high: await read(entry.files.high.file), low: await read(entry.files.low.file) };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function loader(): Promise<GLTFLoader> {
  await MeshoptDecoder.ready;
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}

export function memoryCounter() {
  const geometries = new Set<BufferGeometry>();
  const textures = new Set<Texture>();
  const track = <T extends BufferGeometry | Texture>(item: T, set: Set<T>) => {
    if (set.has(item)) return;
    set.add(item);
    const onDispose = () => {
      set.delete(item);
      item.removeEventListener("dispose", onDispose);
    };
    item.addEventListener("dispose", onDispose);
  };
  return {
    /** What a render of `root` would upload. */
    upload(root: Object3D) {
      root.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        track(o.geometry, geometries);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) for (const t of texturesOf(m)) track(t, textures);
      });
    },
    counts: () => ({ geometries: geometries.size, textures: textures.size }),
  };
}

/** A Response streaming `bytes` in chunks of `chunk` bytes. */
export function chunkedResponse(bytes: ArrayBuffer, chunk = 4096): Response {
  const data = new Uint8Array(bytes);
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= data.byteLength) return controller.close();
      controller.enqueue(data.slice(offset, offset + chunk));
      offset += chunk;
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "model/gltf-binary" } });
}
