// Test fixtures for the asset pipeline and the loaders (PF-009): small contract pieces built in
// memory with @gltf-transform/core, so no binary fixture is committed. Used by tests only.
//
// The valid piece (chapter `shared`):
//   meshes     shared_box (PBR_test_box, animated by the clip shared_box_rise), shared_panel
//              (SHADER_test_grid, COLOR_0 mask: red = x ramp, green = border), shared_strip
//              (GLOW_test_amber), shared_pin (PBR_test_box, at the origin – the instanced prop),
//              optionally shared_bench (BAKED_test_bench with a PNG) when `bake` is given
//   empties    ANCHOR_shared, HOTSPOT_slot_01, HOTSPOT_slot_02, GLOW_accent_01, INST_pin_001…003

import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

/** An axis-aligned box primitive's arrays (24 vertices, 12 triangles), centred on `centre`. */
export function boxArrays(size = [0.1, 0.1, 0.1], centre = [0, 0, 0]) {
  const [sx, sy, sz] = size.map((s) => s / 2);
  const faces = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const position = [];
  const normal = [];
  const uv = [];
  const index = [];
  faces.forEach(([n, u, v], f) => {
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      position.push(...[0, 1, 2].map((i) => centre[i] + (n[i] + a * u[i] + b * v[i]) * [sx, sy, sz][i]));
      normal.push(...n);
      uv.push((a + 1) / 2, (b + 1) / 2);
    }
    index.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
  });
  return { position: new Float32Array(position), normal: new Float32Array(normal), uv: new Float32Array(uv), index: new Uint16Array(index) };
}

function primitive(doc, buffer, arrays, material, extra = {}) {
  const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", acc("VEC3", arrays.position))
    .setAttribute("NORMAL", acc("VEC3", arrays.normal))
    .setAttribute("TEXCOORD_0", acc("VEC2", arrays.uv))
    .setIndices(acc("SCALAR", arrays.index))
    .setMaterial(material);
  for (const [semantic, [type, array]] of Object.entries(extra)) prim.setAttribute(semantic, acc(type, array));
  return prim;
}

/**
 * Builds the valid piece; `mutate(doc, parts)` may break it before it is written. Returns the
 * Document and its parts (nodes, materials by name).
 */
export function buildFixture({ bake = null, mutate } = {}) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("Scene");
  doc.getRoot().setDefaultScene(scene);
  /** @type {Record<string, import("@gltf-transform/core").Material>} */
  const materials = {
    pbr: doc.createMaterial("PBR_test_box").setBaseColorFactor([0.04, 0.05, 0.05, 1]).setMetallicFactor(0.45).setRoughnessFactor(0.45),
    shader: doc.createMaterial("SHADER_test_grid").setBaseColorFactor([0.03, 0.03, 0.04, 1]),
    glow: doc.createMaterial("GLOW_test_amber").setBaseColorFactor([0, 0, 0, 1]).setEmissiveFactor([0.79, 0.3, 0.08]),
  };
  /** @type {Record<string, import("@gltf-transform/core").Node>} */
  const nodes = {};
  const addMesh = (name, arrays, material, translation = [0, 0, 0], extra) => {
    const mesh = doc.createMesh(name).addPrimitive(primitive(doc, buffer, arrays, material, extra));
    const node = doc.createNode(name).setMesh(mesh).setTranslation(translation);
    scene.addChild(node);
    nodes[name] = node;
    return node;
  };

  addMesh("shared_box", boxArrays([0.2, 0.2, 0.2], [0, 0.1, 0]), materials.pbr, [-0.5, 0.2, 0]);
  const panel = boxArrays([0.8, 0.5, 0.02], [0, 0.5, -0.3]);
  const colour = new Float32Array((panel.position.length / 3) * 4);
  for (let i = 0; i < panel.position.length / 3; i++) {
    const x = panel.position[i * 3];
    const y = panel.position[i * 3 + 1];
    colour.set([(x + 0.4) / 0.8, Math.abs(x) > 0.3 || y > 0.65 || y < 0.35 ? 1 : 0, 0, 1], i * 4);
  }
  addMesh("shared_panel", panel, materials.shader, [0, 0, 0], { COLOR_0: ["VEC4", colour] });
  addMesh("shared_strip", boxArrays([0.6, 0.01, 0.02], [0, 0.05, 0.3]), materials.glow);
  addMesh("shared_pin", boxArrays([0.03, 0.08, 0.03], [0, 0.04, 0]), materials.pbr);
  if (bake) {
    const texture = doc.createTexture("BAKED_test_bench").setImage(bake).setMimeType("image/png");
    materials.baked = doc.createMaterial("BAKED_test_bench").setBaseColorTexture(texture).setRoughnessFactor(0.7);
    addMesh("shared_bench", boxArrays([1.2, 0.05, 0.8], [0, -0.025, 0]), materials.baked);
  }

  const empty = (name, translation, rotation) => {
    const node = doc.createNode(name).setTranslation(translation);
    if (rotation) node.setRotation(rotation);
    scene.addChild(node);
    nodes[name] = node;
    return node;
  };
  empty("ANCHOR_shared", [0, 0, 0]);
  empty("HOTSPOT_slot_01", [-0.4, 0.7, -0.34]);
  empty("HOTSPOT_slot_02", [0.4, 0.7, -0.34]);
  empty("GLOW_accent_01", [0, 0.3, 0.45]);
  const s = Math.sin(Math.PI / 8);
  const c = Math.cos(Math.PI / 8);
  empty("INST_pin_001", [0.45, 0.2, 0.1]);
  empty("INST_pin_002", [0.6, 0.2, 0.1], [0, s, 0, c]);
  empty("INST_pin_003", [0.75, 0.2, 0.1], [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)]);

  // The clip: shared_box rises 0.2 → 0.3 m and turns 0° → 90° about +Y over 1 s (31 keys).
  const times = new Float32Array(31).map((_, i) => i / 30);
  const translations = new Float32Array(31 * 3);
  const rotations = new Float32Array(31 * 4);
  times.forEach((t, i) => {
    translations.set([-0.5, 0.2 + 0.1 * t, 0], i * 3);
    rotations.set([0, Math.sin((t * Math.PI) / 4), 0, Math.cos((t * Math.PI) / 4)], i * 4);
  });
  const input = doc.createAccessor().setType("SCALAR").setArray(times).setBuffer(buffer);
  const anim = doc.createAnimation("shared_box_rise");
  for (const [path, type, array] of [["translation", "VEC3", translations], ["rotation", "VEC4", rotations]]) {
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(doc.createAccessor().setType(type).setArray(array).setBuffer(buffer)).setInterpolation("LINEAR");
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(nodes.shared_box).setTargetPath(path).setSampler(sampler));
  }
  const parts = { doc, scene, buffer, nodes, materials };
  mutate?.(doc, parts);
  return parts;
}

/** The fixture as GLB bytes. */
export async function fixtureGlb(options) {
  const { doc } = buildFixture(options);
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).writeBinary(doc);
}
