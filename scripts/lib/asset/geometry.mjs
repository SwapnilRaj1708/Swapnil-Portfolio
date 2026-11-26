// Cleaning and geometry compression. The asset contract survives both: empties (leaf nodes), node
// names, extras, COLOR_0, UVs and clips are kept, and nothing is flattened or joined.

import { PropertyType } from "@gltf-transform/core";
import { dedup, meshopt, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

/** What prune may never remove here: empties are leaf nodes; UVs of untextured surfaces (SHADER_) count. */
const KEEP = { keepLeaves: true, keepAttributes: true, keepExtras: true, keepSolidTextures: true };

/**
 * Dedup (keeping every named property: names carry the contract), prune, and TANGENT stripped from
 * primitives whose material has no normal map (the Blender exporter writes tangents file-wide).
 * Returns how many primitives lost their tangents.
 */
export async function cleanDocument(document) {
  await document.transform(dedup({ keepUniqueNames: true }), prune(KEEP));
  let stripped = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getAttribute("TANGENT") && !prim.getMaterial()?.getNormalTexture()) {
        prim.setAttribute("TANGENT", null);
        stripped++;
      }
    }
  }
  await document.transform(prune({ ...KEEP, propertyTypes: [PropertyType.ACCESSOR] }));
  return { tangentsStripped: stripped };
}

/**
 * Meshopt compression (EXT_meshopt_compression + KHR_mesh_quantization): reorder, quantize
 * (positions 14 bit, normals 8 bit, UVs 12 bit, colours 8 bit, normalised integers – COLOR_0 stays
 * linear 0–1) and the meshopt filters. Quantization moves each mesh into a unit grid and puts the
 * inverse scale and offset on its node – or, for an animated node, on a new unnamed child node
 * holding the mesh, so the clip keeps animating the named node. `simplifyLow` ({ ratio, error })
 * simplifies first – only where the asset's budget entry allows it.
 */
export async function compressGeometry(document, { simplifyLow } = {}) {
  await MeshoptEncoder.ready;
  if (simplifyLow) {
    await MeshoptSimplifier.ready;
    await document.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: simplifyLow.ratio, error: simplifyLow.error }));
  }
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: "high" }));
}
