// The asset contract check (STANDARDS.md §6, BLENDER.md §4) on a raw Blender export. Every
// violation is collected, so the export can be fixed in one go; an unknown SHADER_ name is a
// warning (the site draws a fallback), everything else an error.

import {
  anchorChapterOf,
  clipObjectOf,
  emptyKind,
  instanceSourceName,
  isMeshName,
  materialKind,
  parseInstName,
  shaderNameOf,
} from "../../../src/lib/journey/assets/contract-rules.ts";

const EPS = 1e-5;
const isPowerOfTwo = (n) => n > 0 && (n & (n - 1)) === 0;
const fmt = (values) => `(${values.map((v) => Math.round(v * 1e4) / 1e4).join(", ")})`;

/**
 * @param {{ json: any, document: import("@gltf-transform/core").Document, chapter: string, shaderNames: readonly string[] }} input
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateContract({ json, document, chapter, shaderNames }) {
  const errors = [];
  const warnings = [];
  const root = document.getRoot();

  // The raw file itself: no extensions (no compression – the pipeline adds its own), no cameras, no lights.
  const used = [...new Set([...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])])].sort();
  if (used.length) errors.push(`extensions: the raw export uses ${used.join(", ")}; export without compression or extensions (the pipeline adds its own)`);
  const cameras = json.cameras?.length ?? 0;
  if (cameras) errors.push(`cameras: the export holds ${cameras} camera(s); export with cameras off`);
  const lights = json.extensions?.KHR_lights_punctual?.lights?.length ?? 0;
  if (lights) errors.push(`lights: the export holds ${lights} light(s); export with lights off (runtime lights belong to the site)`);

  // Materials: the prefix decides how the site draws a surface.
  for (const material of root.listMaterials()) {
    const name = material.getName();
    const kind = materialKind(name);
    if (!kind) {
      errors.push(`material "${name}": the name must be BAKED_<set>, PBR_<name>, SHADER_<name> or GLOW_<name> with lower-case words after the prefix`);
      continue;
    }
    if (kind === "BAKED" && !material.getBaseColorTexture()) errors.push(`material "${name}": a BAKED_ material needs its baked image as the base-colour texture`);
    if (kind === "GLOW" && material.getEmissiveFactor().every((c) => c <= 0)) errors.push(`material "${name}": a GLOW_ material needs an emission colour`);
    if (kind === "SHADER") {
      const shader = shaderNameOf(name);
      if (!shaderNames.includes(shader)) {
        warnings.push(
          `material "${name}": the site's shader library has no "${shader}" – the site will draw a fallback (development: an amber ` +
            "wireframe and a console warning; production: a plain dark surface). Register it in src/components/journey/assets/shaders/library.ts " +
            "and src/lib/journey/assets/shader-names.ts.",
        );
      }
    }
  }

  // Nodes: names, transforms applied, +Y up, scale 1.
  const nodes = root.listNodes();
  const seen = new Map();
  for (const node of nodes) seen.set(node.getName(), (seen.get(node.getName()) ?? 0) + 1);
  for (const [name, count] of seen) if (count > 1) errors.push(`node "${name}": ${count} objects share this name; names must be unique`);
  for (const node of nodes) {
    const name = node.getName();
    const mesh = node.getMesh();
    if (node.getCamera()) errors.push(`node "${name}": holds a camera`);
    const scale = node.getScale();
    if (scale.some((s) => Math.abs(s - 1) > EPS)) errors.push(`node "${name}": scale ${fmt(scale)} – apply scale in Blender (scale 1)`);
    const [x, y, z, w] = node.getRotation();
    const rotated = Math.abs(x) > EPS || Math.abs(y) > EPS || Math.abs(z) > EPS || Math.abs(Math.abs(w) - 1) > EPS;
    if (rotated && (mesh || node.listChildren().length)) {
      errors.push(`node "${name}": rotated ${fmt([x, y, z, w])} – apply rotation in Blender (+Y up, transforms applied; only empties may carry a rotation)`);
    }
    if (mesh) {
      if (!isMeshName(name, chapter)) errors.push(`mesh object "${name}": the name must be ${chapter}_<element>[_<part>] in lower case`);
      const meshName = mesh.getName();
      if (meshName && meshName !== name && !isMeshName(meshName, chapter)) errors.push(`mesh data "${meshName}" (object "${name}"): the name must be ${chapter}_<element>[_<part>] in lower case`);
      continue;
    }
    if (!emptyKind(name, chapter)) {
      const anchor = anchorChapterOf(name);
      errors.push(
        anchor !== null
          ? `empty "${name}": an anchor must be named after its chapter, ANCHOR_${chapter}`
          : `empty "${name}": the name must be ANCHOR_${chapter}, HOTSPOT_<name>, INST_<prop>_<nnn> or GLOW_<name>`,
      );
    }
  }

  // Instanced props: every INST_<prop>_* needs the source mesh <chapter>_<prop>, at the origin.
  const props = [...new Set(nodes.map((n) => parseInstName(n.getName())?.prop).filter(Boolean))].sort();
  for (const prop of props) {
    const sourceName = instanceSourceName(chapter, prop);
    const source = nodes.find((n) => n.getName() === sourceName && n.getMesh());
    if (!source) {
      errors.push(`INST_${prop}_*: no source mesh "${sourceName}" – model the prop once at the origin and name it ${sourceName}`);
    } else if (source.getTranslation().some((t) => Math.abs(t) > EPS)) {
      errors.push(`instance source "${sourceName}": must sit at the origin (it is at ${fmt(source.getTranslation())}); the INST_ empties place the copies`);
    }
  }

  // Clips: <object>_<verb>, the object being the node it animates.
  for (const animation of root.listAnimations()) {
    const name = animation.getName();
    const targets = [...new Set(animation.listChannels().map((c) => c.getTargetNode()?.getName()).filter(Boolean))].sort();
    if (!targets.length) {
      errors.push(`clip "${name}": animates nothing`);
      continue;
    }
    if (!clipObjectOf(name, targets)) errors.push(`clip "${name}": the name must be <object>_<verb>, where <object> is the node it animates (${targets.join(", ")})`);
  }

  // Images: PNG, power-of-two sides.
  for (const texture of root.listTextures()) {
    const name = texture.getName() || texture.getURI() || "(unnamed)";
    if (texture.getMimeType() !== "image/png") errors.push(`image "${name}": ${texture.getMimeType() || "unknown type"} – textures are PNG`);
    const size = texture.getSize();
    if (size && (!isPowerOfTwo(size[0]) || !isPowerOfTwo(size[1]))) errors.push(`image "${name}": ${size[0]} × ${size[1]} – sides must be powers of two`);
  }

  return { errors, warnings };
}
