// @vitest-environment node
import {
  Color,
  DataTexture,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  Quaternion,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  BoxGeometry,
} from "three";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PALETTE } from "@/styles/palette";
import { applyAssetContract, BLOOM_LAYER, meshDisplayName, nodeName, type ContractAsset } from "./contract";
import { loader, memoryCounter, pipelineFixture } from "./test-helpers";

// PF-009: the loaders apply the asset contract (STANDARDS.md §6) – each material prefix, the
// empties, instancing, clips and disposal. Prefix rules on hand-built scenes; everything else on
// the pipeline's real (Meshopt, quantized) output of the fixture piece, parsed by three's GLTFLoader.

const options = { key: "shared/test", chapter: "shared", tier: "high" as const, dev: true };

function sceneWith(materialName: string, material: MeshStandardMaterial = new MeshStandardMaterial()) {
  material.name = materialName;
  const root = new Group();
  const mesh: Mesh = new Mesh(new BoxGeometry(), material);
  mesh.name = "shared_thing";
  root.add(mesh);
  return { root, mesh, material };
}

describe("material prefixes", () => {
  it("BAKED_: unlit MeshBasicMaterial with the bake as its sRGB map, tone-mapped; the lit original is disposed", () => {
    const bake = new DataTexture(new Uint8Array(16), 2, 2);
    bake.colorSpace = SRGBColorSpace; // as GLTFLoader (and KTX2Loader's DFD) set it for a base-colour map
    const source = new MeshStandardMaterial({ map: bake });
    const dispose = vi.spyOn(source, "dispose");
    const { root, mesh } = sceneWith("BAKED_port_floor", source);
    const asset = applyAssetContract(root, [], options);
    expect(mesh.material).toBeInstanceOf(MeshBasicMaterial); // unlit: lights never touch it
    const material = mesh.material as MeshBasicMaterial;
    expect(material.name).toBe("BAKED_port_floor");
    expect(material.map).toBe(bake);
    expect(material.map?.colorSpace).toBe(SRGBColorSpace);
    expect(material.toneMapped).toBe(true);
    expect(dispose).toHaveBeenCalled();
    expect(asset.meshes[0]).toMatchObject({ kind: "BAKED", material: "BAKED_port_floor" });
  });

  it("PBR_: the loaded standard material stays (lit by the runtime lights)", () => {
    const { root, mesh, material } = sceneWith("PBR_chassis_metal");
    applyAssetContract(root, [], options);
    expect(mesh.material).toBe(material);
    expect(mesh.material).toBeInstanceOf(MeshStandardMaterial);
  });

  it("SHADER_<name>: the library's material; the low tier gets its low variant", () => {
    for (const tier of ["high", "low"] as const) {
      const { root, mesh } = sceneWith("SHADER_test_grid");
      const asset = applyAssetContract(root, [], { ...options, tier });
      const material = mesh.material as ShaderMaterial;
      expect(material).toBeInstanceOf(ShaderMaterial);
      expect(material.vertexColors).toBe(true); // reads the COLOR_0 mask
      expect(material.name).toBe("SHADER_test_grid");
      expect("LOW_TIER" in material.defines).toBe(tier === "low");
      expect(asset.meshes[0]).toMatchObject({ kind: "SHADER", fallback: false });
    }
  });

  it("an unknown SHADER_ name: development warns loudly and draws an obvious fallback", () => {
    const warn = vi.fn();
    const { root, mesh } = sceneWith("SHADER_holo_grid");
    const asset = applyAssetContract(root, [], { ...options, dev: true, warn });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/WARNING – shared\/test: material "SHADER_holo_grid" names a shader the library does not have \("holo_grid"\)/);
    const material = mesh.material as MeshBasicMaterial;
    expect(material.wireframe).toBe(true);
    expect(material.color.equals(new Color(PALETTE["accent-trace"]))).toBe(true);
    expect(asset.meshes[0]).toMatchObject({ kind: "SHADER", fallback: true });
  });

  it("an unknown SHADER_ name: production draws a plain dark surface, silently", () => {
    const warn = vi.fn();
    const { root, mesh } = sceneWith("SHADER_holo_grid");
    applyAssetContract(root, [], { ...options, dev: false, warn });
    expect(warn).not.toHaveBeenCalled();
    const material = mesh.material as MeshBasicMaterial;
    expect(material.wireframe).toBe(false);
    expect(material.color.equals(new Color(PALETTE.surface))).toBe(true);
  });

  it("GLOW_: unlit, colour = emission × strength, tagged for bloom (userData + layer)", () => {
    const source = new MeshStandardMaterial({ color: 0x000000, emissive: new Color(0.8, 0.3, 0.1), emissiveIntensity: 1.5 });
    const { root, mesh } = sceneWith("GLOW_trace_amber", source);
    applyAssetContract(root, [], options);
    const material = mesh.material as MeshBasicMaterial;
    expect(material).toBeInstanceOf(MeshBasicMaterial);
    expect(material.color.r).toBeCloseTo(1.2);
    expect(material.color.g).toBeCloseTo(0.45);
    expect(material.userData.bloom).toBe(true);
    expect(mesh.layers.isEnabled(BLOOM_LAYER)).toBe(true);
    expect(mesh.layers.isEnabled(0)).toBe(true);
  });

  it("a shared material stays shared after replacement", () => {
    const root = new Group();
    const source = new MeshStandardMaterial({ name: "GLOW_x" });
    const a = new Mesh(new BoxGeometry(), source);
    const b = new Mesh(new BoxGeometry(), source);
    root.add(a, b);
    applyAssetContract(root, [], options);
    expect(a.material).toBe(b.material);
  });
});

describe("a pipeline asset through GLTFLoader", () => {
  let fixture: Awaited<ReturnType<typeof pipelineFixture>>;
  beforeAll(async () => {
    fixture = await pipelineFixture();
  }, 60_000);

  async function load(variant: "high" | "low" = "high", tier: "high" | "low" = "high"): Promise<ContractAsset> {
    const gltf = await (await loader()).parseAsync(fixture[variant].slice(0), "");
    return applyAssetContract(gltf.scene, gltf.animations, { ...options, key: "shared/loader-test", tier });
  }

  it("classifies every mesh by its material prefix", async () => {
    const asset = await load();
    expect(asset.meshes.map((m) => [m.name, m.kind, m.copies])).toEqual([
      ["INST_pin", "PBR", 3],
      ["shared_box", "PBR", 1], // its mesh sits on an unnamed child node (quantization of an animated node)
      ["shared_panel", "SHADER", 1],
      ["shared_strip", "GLOW", 1],
    ]);
  });

  it("INST_<prop>_<nnn> → one InstancedMesh at the empties' transforms; the source is never drawn in place", async () => {
    const asset = await load();
    expect(asset.instances.map(({ prop, source, count }) => ({ prop, source, count }))).toEqual([{ prop: "pin", source: "shared_pin", count: 3 }]);
    const instanced = asset.instances[0].mesh;
    expect(instanced).toBeInstanceOf(InstancedMesh);
    let sourceInScene = false;
    asset.root.traverse((o) => {
      if (o instanceof Mesh && !(o instanceof InstancedMesh) && nodeName(o) === "shared_pin") sourceInScene = true;
    });
    expect(sourceInScene).toBe(false);
    // Each copy: the empty's transform × the source's own (quantization) transform. The pin's
    // bottom-centre vertex (0, 0, 0 in its authored space) lands on each empty's position.
    const expected = [
      { t: [0.45, 0.2, 0.1], yaw: 0 },
      { t: [0.6, 0.2, 0.1], yaw: 45 },
      { t: [0.75, 0.2, 0.1], yaw: 90 },
    ];
    const m = new Matrix4();
    const p = new Vector3();
    const q = new Quaternion();
    const s = new Vector3();
    const box = instanced.geometry.boundingBox ?? (instanced.geometry.computeBoundingBox(), instanced.geometry.boundingBox!);
    expected.forEach((e, i) => {
      instanced.getMatrixAt(i, m);
      const bottomCentre = new Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2).applyMatrix4(m);
      expect(bottomCentre.x).toBeCloseTo(e.t[0], 3);
      expect(bottomCentre.y).toBeCloseTo(e.t[1], 3);
      expect(bottomCentre.z).toBeCloseTo(e.t[2], 3);
      m.decompose(p, q, s);
      expect((2 * Math.atan2(q.y, q.w) * 180) / Math.PI).toBeCloseTo(e.yaw, 2);
    });
  });

  it("ANCHOR_, HOTSPOT_ and GLOW_ empties become registry points at their world positions", async () => {
    const asset = await load();
    const byName = Object.fromEntries(asset.points.map((p) => [p.name, p]));
    expect(Object.keys(byName).sort()).toEqual(["ANCHOR_shared", "GLOW_accent_01", "HOTSPOT_slot_01", "HOTSPOT_slot_02"]);
    expect(byName.ANCHOR_shared.kind).toBe("anchor");
    expect(byName.HOTSPOT_slot_01.kind).toBe("hotspot");
    expect(byName.GLOW_accent_01.kind).toBe("glow");
    expect(byName.HOTSPOT_slot_01.asset).toBe("shared/loader-test");
    [-0.4, 0.7, -0.34].forEach((v, i) => expect(byName.HOTSPOT_slot_01.position[i]).toBeCloseTo(v, 5));
    [0, 0.3, 0.45].forEach((v, i) => expect(byName.GLOW_accent_01.position[i]).toBeCloseTo(v, 5));
  });

  it("clips scrub by progress 0–1, forwards and backwards (paused actions)", async () => {
    const asset = await load();
    expect(asset.clips).toEqual([{ name: "shared_box_rise", duration: expect.closeTo(1, 4) }]);
    let box: Object3D | null = null;
    asset.root.traverse((o) => {
      if (!box && nodeName(o) === "shared_box") box = o;
    });
    const node = box as unknown as Object3D;
    const pose = () => ({ y: node.position.y, yaw: (2 * Math.atan2(node.quaternion.y, node.quaternion.w) * 180) / Math.PI });
    const at = (p: number) => {
      asset.scrub(p);
      return pose();
    };
    const expectPose = (got: { y: number; yaw: number }, y: number, yaw: number) => {
      expect(got.y).toBeCloseTo(y, 3);
      expect(got.yaw).toBeCloseTo(yaw, 1);
    };
    expectPose(at(0), 0.2, 0);
    expectPose(at(0.5), 0.25, 45);
    expectPose(at(1), 0.3, 90);
    // Backwards, and the same poses again.
    expectPose(at(0.5), 0.25, 45);
    expectPose(at(0), 0.2, 0);
    expectPose(at(1.7), 0.3, 90); // clamped
    expectPose(at(-1), 0.2, 0);
    asset.scrub(0.5, "no_such_clip");
    expectPose(pose(), 0.2, 0); // another clip's name leaves this one alone
  });

  it("the low tier gets the shader's low variant", async () => {
    const asset = await load("low", "low");
    let shader: ShaderMaterial | null = null;
    asset.root.traverse((o) => {
      if (o instanceof Mesh && o.material instanceof ShaderMaterial) shader = o.material;
    });
    expect(shader).not.toBeNull();
    expect("LOW_TIER" in (shader as unknown as ShaderMaterial).defines).toBe(true);
  });

  it("dispose frees every geometry and texture: the memory counters return to their baseline", async () => {
    const counter = memoryCounter();
    const parent = new Group();
    const baseline = counter.counts();
    const asset = await load();
    // A bake texture too, so textures are counted (the fixture has none).
    const baked = new DataTexture(new Uint8Array(16), 2, 2);
    baked.colorSpace = NoColorSpace;
    const extra = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ map: baked }));
    asset.root.add(extra);
    parent.add(asset.root);
    counter.upload(parent);
    expect(counter.counts().geometries).toBe(5); // box, panel, strip, pin (instanced), extra
    expect(counter.counts().textures).toBe(1);
    asset.dispose();
    expect(counter.counts()).toEqual(baseline);
    expect(asset.root.parent).toBeNull();
    asset.dispose(); // twice is harmless
  });
});

describe("names", () => {
  it("meshDisplayName falls back to the parent node for a mesh moved onto an unnamed child", () => {
    const parent = new Object3D();
    parent.userData.name = "shared_box";
    const child = new Mesh();
    child.name = "shared_box_1";
    parent.add(child);
    expect(meshDisplayName(child)).toBe("shared_box");
    child.userData.name = "own";
    expect(meshDisplayName(child)).toBe("own");
  });
});
