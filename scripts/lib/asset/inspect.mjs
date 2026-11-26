// Reading and measuring a glTF document for the asset pipeline: the GLB's own JSON (for what
// gltf-transform does not keep – which extensions the raw file used, cameras, lights) and the
// numbers the budgets are checked against.

import { getGLPrimitiveCount } from "@gltf-transform/functions";
import { emptyKind, EMPTY_KINDS, instanceSourceName, materialKind, parseInstName } from "../../../src/lib/journey/assets/contract-rules.ts";

/** The JSON chunk of a GLB file. Throws on anything that is not glTF Binary 2.0. */
export function readGlbJson(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB file (glTF Binary): no glTF header");
  if (view.getUint32(4, true) !== 2) throw new Error(`GLB version ${view.getUint32(4, true)}; glTF 2.0 expected`);
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a) throw new Error("GLB: the first chunk is not JSON");
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
}

function primitiveTriangles(mesh) {
  return mesh.listPrimitives().reduce((sum, prim) => sum + (prim.getMode() === 4 ? getGLPrimitiveCount(prim) : 0), 0);
}

/** Pixel size of an image (PNG, JPEG, KTX2 …), or null. */
export function textureSize(texture) {
  const size = texture.getSize();
  return size ? { width: size[0], height: size[1] } : null;
}

/** The longest key time of an animation (its duration in s). */
function clipDuration(animation) {
  let end = 0;
  for (const sampler of animation.listSamplers()) {
    const input = sampler.getInput();
    if (input) end = Math.max(end, input.getMax([])[0]);
  }
  return end;
}

/**
 * The numbers of a document: triangles (each mesh once, as Blender counts them; and drawn – an
 * instanced prop once per INST_ copy, its source never in place), materials with their kinds,
 * images and sizes, objects (nodes), clips, empties by prefix, instanced props.
 */
export function measureDocument(document, chapter) {
  const root = document.getRoot();
  const nodes = root.listNodes();
  const empties = Object.fromEntries(EMPTY_KINDS.map((k) => [k, /** @type {string[]} */ ([])]));
  const instanceCounts = new Map();
  for (const node of nodes) {
    if (node.getMesh()) continue;
    const kind = emptyKind(node.getName(), chapter);
    if (kind) empties[kind].push(node.getName());
    const inst = parseInstName(node.getName());
    if (inst) instanceCounts.set(inst.prop, (instanceCounts.get(inst.prop) ?? 0) + 1);
  }
  for (const k of EMPTY_KINDS) empties[k].sort();
  const sources = new Map([...instanceCounts].map(([prop, count]) => [instanceSourceName(chapter, prop), count]));

  let triangles = 0;
  for (const mesh of root.listMeshes()) triangles += primitiveTriangles(mesh);
  let trianglesDrawn = 0;
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    trianglesDrawn += primitiveTriangles(mesh) * (sources.get(node.getName()) ?? 1);
  }

  const materials = root
    .listMaterials()
    .map((m) => ({ name: m.getName(), kind: materialKind(m.getName()) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const images = root
    .listTextures()
    .map((t) => ({ name: t.getName(), mimeType: t.getMimeType(), ...(textureSize(t) ?? { width: 0, height: 0 }) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const clips = root
    .listAnimations()
    .map((a) => ({ name: a.getName(), duration: Math.round(clipDuration(a) * 1e4) / 1e4 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const instances = [...instanceCounts]
    .map(([prop, count]) => ({ prop, source: instanceSourceName(chapter, prop), count }))
    .sort((a, b) => a.prop.localeCompare(b.prop));

  return { triangles, trianglesDrawn, objects: nodes.length, materials, images, clips, empties, instances };
}
