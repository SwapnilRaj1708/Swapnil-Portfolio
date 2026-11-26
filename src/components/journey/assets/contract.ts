import {
  AnimationMixer,
  InstancedMesh,
  LoopOnce,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  Texture,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type BufferGeometry,
  type Color,
  type Material,
  type Object3D,
} from "three";
import { emptyKind, instanceSourceName, materialKind, parseInstName, shaderNameOf, type MaterialKind } from "@/lib/journey/assets/contract-rules";
import type { AssetPoint, PointKind } from "@/lib/journey/assets/points";
import type { RenderTier } from "@/lib/journey/tiers";
import { fallbackShaderMaterial, libraryLookup, type ShaderLookup } from "./shaders/library";

/**
 * Applies the asset contract (STANDARDS.md §6) to a loaded glTF scene – the "loaders that apply
 * the contract" of PF-009. Names decide everything:
 *
 *   BAKED_<set>    → unlit: MeshBasicMaterial with the baked image as its map (sRGB, tone-mapped
 *                    like the rest of the scene). The bake already holds the lighting (Blender
 *                    question 1), so a lit material would light it twice.
 *   PBR_<name>     → kept as loaded (MeshStandardMaterial), lit by the scene's runtime lights (≤ 2).
 *   SHADER_<name>  → the shader library's material of that name (shaders/library.ts). Unknown name:
 *                    development – a loud console warning and an obvious fallback (amber
 *                    wireframe); production – a plain dark fallback, silently.
 *   GLOW_<name>    → emissive: unlit MeshBasicMaterial whose colour is the emission colour ×
 *                    strength, tagged for PF-011's bloom: `material.userData.bloom = true` and the
 *                    mesh on BLOOM_LAYER (besides layer 0, so it still renders normally).
 *   ANCHOR_ / HOTSPOT_ / GLOW_ empties → points (world positions) for the registries (points.ts).
 *   INST_<prop>_<nnn> empties → one InstancedMesh per prop at their transforms, drawing the mesh
 *                    `<chapter>_<prop>`; that source mesh is never drawn in place (removed).
 *   clips          → one AnimationMixer for the asset, every action playing but paused: `scrub(p)`
 *                    poses the clip at p × its duration (0–1, forwards and backwards). Setting a
 *                    paused action's time and updating the mixer by 0 allocates nothing.
 *
 * `dispose()` frees every geometry, material and texture the asset brought or created here, the
 * instance buffers and the mixer's caches, and takes the asset out of the scene.
 */

/** Meshes with a GLOW_ material are also on this layer: PF-011's bloom pass renders it alone. */
export const BLOOM_LAYER = 1;

export type MeshKind = MaterialKind | "UNKNOWN";

export type ContractMeshInfo = {
  /** The glTF node's name. */
  name: string;
  /** The material's name as exported (`PBR_test_metal`). */
  material: string;
  kind: MeshKind;
  /** Triangles of one copy. */
  triangles: number;
  /** Copies drawn (1, or the instance count). */
  copies: number;
  /** A SHADER_ material whose name the library does not know (drawn with the fallback). */
  fallback: boolean;
};

export type ContractAsset = {
  key: string;
  root: Object3D;
  meshes: ContractMeshInfo[];
  instances: { prop: string; source: string; count: number; mesh: InstancedMesh }[];
  points: AssetPoint[];
  clips: { name: string; duration: number }[];
  /** Poses every clip (or one, by name) at progress 0–1 of its duration. */
  scrub: (progress: number, clip?: string) => void;
  dispose: () => void;
};

export type ContractOptions = {
  /** The asset's key (`<chapter>/<slug>`), recorded on its points. */
  key: string;
  chapter: string;
  tier: RenderTier;
  /** Development behaviour for unknown shaders (warning + obvious fallback). */
  dev: boolean;
  shaders?: ShaderLookup;
  warn?: (message: string) => void;
};

/** The glTF node name (GLTFLoader keeps the original in userData.name; `name` may be made unique). */
export function nodeName(object: Object3D): string {
  const original = object.userData.name;
  return typeof original === "string" ? original : object.name;
}

function triangleCount(geometry: BufferGeometry): number {
  const count = geometry.index ? geometry.index.count : (geometry.getAttribute("position")?.count ?? 0);
  return Math.floor(count / 3);
}

/**
 * The name to show for a mesh: its node's, or – when quantization moved the mesh of an animated
 * node onto an unnamed child node (scripts/lib/asset/geometry.mjs) – the parent node's.
 */
export function meshDisplayName(object: Object3D): string {
  if (typeof object.userData.name === "string") return object.userData.name;
  const parent = object.parent;
  if (parent && typeof parent.userData.name === "string") return parent.userData.name;
  return object.name;
}

/** Every texture a material holds (its maps, or a shader's uniforms). */
export function texturesOf(material: Material, into: Set<Texture> = new Set()): Set<Texture> {
  for (const value of Object.values(material)) if (value instanceof Texture) into.add(value);
  if (material instanceof ShaderMaterial) {
    for (const uniform of Object.values(material.uniforms)) if (uniform.value instanceof Texture) into.add(uniform.value);
  }
  return into;
}

function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

type StandardLike = Material & { map?: Texture | null; emissive?: Color; emissiveIntensity?: number; emissiveMap?: Texture | null };

function bakedMaterial(source: StandardLike): MeshBasicMaterial {
  return new MeshBasicMaterial({
    name: source.name,
    map: source.map ?? null,
    side: source.side,
    vertexColors: source.vertexColors,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
  });
}

function glowMaterial(source: StandardLike): MeshBasicMaterial {
  const material = new MeshBasicMaterial({ name: source.name, side: source.side, map: source.emissiveMap ?? null });
  if (source.emissive) material.color.copy(source.emissive).multiplyScalar(source.emissiveIntensity ?? 1);
  material.userData.bloom = true;
  return material;
}

export function applyAssetContract(scene: Object3D, animations: readonly AnimationClip[], options: ContractOptions): ContractAsset {
  const lookup = options.shaders ?? libraryLookup;
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const root = scene;
  root.updateMatrixWorld(true);
  const rootInverse = new Matrix4().copy(root.matrixWorld).invert();
  const relative = new Matrix4();
  const position = new Vector3();

  // Everything the asset brought, for disposal (textures of replaced materials included).
  const textures = new Set<Texture>();
  const originals = new Set<Material>();
  const meshes: Mesh[] = [];
  const empties: { object: Object3D; name: string; kind: ReturnType<typeof emptyKind> }[] = [];
  root.traverse((object) => {
    if (object === root) return;
    if (object instanceof Mesh) {
      meshes.push(object);
      for (const material of materialsOf(object)) {
        originals.add(material);
        texturesOf(material, textures);
      }
      return;
    }
    const name = nodeName(object);
    const kind = emptyKind(name, options.chapter);
    if (kind) empties.push({ object, name, kind });
  });

  // Materials by prefix. Shared materials stay shared, except shader materials (one per mesh: a
  // shader may take uniforms from its mesh).
  const replaced = new Map<Material, Material>();
  const info = new Map<Mesh, { kind: MeshKind; material: string; fallback: boolean }>();
  for (const mesh of meshes) {
    const finals = materialsOf(mesh).map((source) => {
      const kind = materialKind(source.name);
      if (kind === "SHADER") {
        const name = shaderNameOf(source.name) ?? "";
        const definition = lookup(name);
        if (!definition && options.dev) {
          warn(
            `[assets] WARNING – ${options.key}: material "${source.name}" names a shader the library does not have ("${name}"). ` +
              "Drawing the development fallback (amber wireframe). Register it in src/components/journey/assets/shaders/library.ts " +
              "and src/lib/journey/assets/shader-names.ts.",
          );
        }
        info.set(mesh, { kind, material: source.name, fallback: !definition });
        return definition ? definition.create({ source, mesh, tier: options.tier }) : fallbackShaderMaterial(name, options.dev);
      }
      info.set(mesh, { kind: kind ?? "UNKNOWN", material: source.name, fallback: false });
      if (kind === "PBR" || kind === null) return source;
      let final = replaced.get(source);
      if (!final) {
        final = kind === "BAKED" ? bakedMaterial(source as StandardLike) : glowMaterial(source as StandardLike);
        replaced.set(source, final);
      }
      return final;
    });
    mesh.material = Array.isArray(mesh.material) ? finals : finals[0];
    if (info.get(mesh)?.kind === "GLOW") mesh.layers.enable(BLOOM_LAYER);
  }
  const inUse = new Set<Material>(meshes.flatMap(materialsOf));
  for (const material of originals) if (!inUse.has(material)) material.dispose();

  // Instancing: INST_<prop>_<nnn> → one InstancedMesh per prop, drawing `<chapter>_<prop>`.
  const props = new Map<string, { index: number; object: Object3D }[]>();
  for (const empty of empties) {
    if (empty.kind !== "INST") continue;
    const parsed = parseInstName(empty.name);
    if (!parsed) continue;
    const list = props.get(parsed.prop) ?? [];
    list.push({ index: parsed.index, object: empty.object });
    props.set(parsed.prop, list);
  }
  const instances: ContractAsset["instances"] = [];
  const removedSources: Mesh[] = [];
  for (const [prop, list] of [...props].sort(([a], [b]) => a.localeCompare(b))) {
    const sourceName = instanceSourceName(options.chapter, prop);
    let sourceMesh: Mesh | null = null;
    root.traverse((object) => {
      if (sourceMesh || nodeName(object) !== sourceName) return;
      if (object instanceof Mesh) sourceMesh = object;
      else object.traverse((child) => (sourceMesh ??= child instanceof Mesh ? child : null));
    });
    const source = sourceMesh as Mesh | null;
    if (!source) {
      if (options.dev) warn(`[assets] ${options.key}: INST_${prop}_* has no source mesh "${sourceName}" – not drawn.`);
      continue;
    }
    list.sort((a, b) => a.index - b.index);
    // The source's own transform (identity at the origin; it carries the quantization scale and
    // offset the pipeline put on the node) applies inside every copy.
    const sourceMatrix = new Matrix4().multiplyMatrices(rootInverse, source.matrixWorld);
    const instanced = new InstancedMesh(source.geometry, source.material, list.length);
    instanced.name = `INST_${prop}`;
    instanced.userData.name = `INST_${prop}`;
    list.forEach(({ object }, i) => {
      relative.multiplyMatrices(rootInverse, object.matrixWorld).multiply(sourceMatrix);
      instanced.setMatrixAt(i, relative);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
    instanced.computeBoundingBox();
    instanced.layers.mask = source.layers.mask;
    const sourceInfo = info.get(source);
    if (sourceInfo) info.set(instanced, sourceInfo);
    source.removeFromParent();
    removedSources.push(source);
    root.add(instanced);
    instances.push({ prop, source: sourceName, count: list.length, mesh: instanced });
  }

  // Points for the registries: world positions (the asset is authored in world position and its
  // root sits at the origin).
  const pointKinds: Record<string, PointKind> = { ANCHOR: "anchor", HOTSPOT: "hotspot", GLOW: "glow" };
  const points: AssetPoint[] = empties
    .filter((e) => e.kind !== "INST")
    .map((e) => {
      position.setFromMatrixPosition(relative.multiplyMatrices(rootInverse, e.object.matrixWorld));
      return { asset: options.key, kind: pointKinds[e.kind as string], name: e.name, position: [position.x, position.y, position.z] as const };
    })
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind)));

  // Clips: paused actions, scrubbed by progress.
  const mixer = new AnimationMixer(root);
  const actions: AnimationAction[] = animations.map((clip) => {
    const action = mixer.clipAction(clip);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    action.paused = true;
    action.time = 0;
    return action;
  });
  mixer.update(0);
  const scrub = (progress: number, clip?: string) => {
    const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const c = action.getClip();
      if (clip !== undefined && c.name !== clip) continue;
      action.time = p * c.duration;
    }
    mixer.update(0);
  };

  const meshInfo: ContractMeshInfo[] = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const i = info.get(object);
    meshInfo.push({
      name: meshDisplayName(object),
      material: i?.material ?? materialsOf(object)[0]?.name ?? "",
      kind: i?.kind ?? "UNKNOWN",
      triangles: triangleCount(object.geometry),
      copies: object instanceof InstancedMesh ? object.count : 1,
      fallback: i?.fallback ?? false,
    });
  });
  meshInfo.sort((a, b) => a.name.localeCompare(b.name));

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    mixer.stopAllAction();
    for (const clip of animations) mixer.uncacheClip(clip);
    mixer.uncacheRoot(root);
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const instancedMeshes: InstancedMesh[] = [];
    const collect = (mesh: Mesh) => {
      geometries.add(mesh.geometry);
      for (const material of materialsOf(mesh)) materials.add(material);
      if (mesh instanceof InstancedMesh) instancedMeshes.push(mesh);
    };
    root.traverse((object) => {
      if (object instanceof Mesh) collect(object);
    });
    removedSources.forEach(collect);
    for (const material of materials) texturesOf(material, textures);
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    for (const mesh of instancedMeshes) mesh.dispose();
    root.removeFromParent();
  };

  return {
    key: options.key,
    root,
    meshes: meshInfo,
    instances,
    points,
    clips: animations.map((clip) => ({ name: clip.name, duration: clip.duration })),
    scrub,
    dispose,
  };
}
