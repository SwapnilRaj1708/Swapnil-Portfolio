import { REVISION, type WebGLRenderer } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

/**
 * Decoders and transcoders, served by the site itself (STANDARDS.md §4: at runtime the browser
 * contacts no third-party host). `npm run decoders` (scripts/copy-decoders.mjs, run before every
 * build and `next dev`) copies them from the INSTALLED three.js into
 * `public/decoders/three-r<REVISION>/`:
 *
 *   basis/basis_transcoder.js + .wasm   the Basis Universal transcoder for KTX2 textures (KTX2Loader)
 *   meshopt_decoder.module.js           the Meshopt geometry decoder (its WASM is inside the file)
 *
 * The folder is named after three's REVISION, read here from the same installed three.js, so the
 * code can only ever ask for the transcoder of the version it was built with. The Zstandard decoder
 * for UASTC textures is part of three's KTX2Loader module and arrives inside the lazy 3D chunk.
 */
export const DECODER_DIR = `/decoders/three-r${REVISION}/`;
export const BASIS_TRANSCODER_DIR = `${DECODER_DIR}basis/`;
export const MESHOPT_DECODER_URL = `${DECODER_DIR}meshopt_decoder.module.js`;

type MeshoptModule = typeof import("three/examples/jsm/libs/meshopt_decoder.module.js");
export type MeshoptDecoder = MeshoptModule["MeshoptDecoder"];

let meshopt: Promise<MeshoptDecoder> | null = null;

/**
 * The Meshopt decoder from the site's own path. A runtime import of a URL, not a bundled module
 * (`webpackIgnore`, honoured by Turbopack): the file in public/ is the one three.js ships.
 */
export function loadMeshoptDecoder(url: string = MESHOPT_DECODER_URL): Promise<MeshoptDecoder> {
  meshopt ??= (import(/* webpackIgnore: true */ url) as Promise<MeshoptModule>).then(async (module) => {
    await module.MeshoptDecoder.ready;
    return module.MeshoptDecoder;
  });
  meshopt.catch(() => {
    meshopt = null; // a failed fetch may be retried by the next load
  });
  return meshopt;
}

export type AssetLoaders = {
  gltf: GLTFLoader;
  ktx2: KTX2Loader;
  /** Ends the transcoder's workers. */
  dispose: () => void;
};

/**
 * A glTF loader for pipeline assets on this renderer: KTX2 textures through the site's Basis
 * transcoder (formats chosen for this GPU by `detectSupport`), Meshopt geometry through the site's
 * decoder. One per renderer: KTX2Loader keeps a worker pool and warns about several instances.
 */
export async function createAssetLoaders(renderer: WebGLRenderer, options: { meshopt?: () => Promise<MeshoptDecoder> } = {}): Promise<AssetLoaders> {
  const decoder = await (options.meshopt ?? loadMeshoptDecoder)();
  const ktx2 = new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_DIR).detectSupport(renderer);
  const gltf = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(decoder);
  return { gltf, ktx2, dispose: () => ktx2.dispose() };
}
