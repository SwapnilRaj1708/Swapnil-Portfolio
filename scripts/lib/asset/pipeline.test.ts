// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Document } from "@gltf-transform/core";
import { KHRLightsPunctual } from "@gltf-transform/extensions";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { budgets } from "../../../budgets.config.mjs";
import { checkInputBudget, resolveBudget } from "./budget.mjs";
import { buildFixture, fixtureGlb } from "./fixtures.mjs";
import { checkKtxVersion, findKtx, parseCompare } from "./ktx.mjs";
import { DOCS_END, DOCS_START, parseManifest, renderManifest } from "./manifest.mjs";
import { createIO, parseAssetKey, runAssetPipeline } from "./pipeline.mjs";

// PF-009: the asset pipeline on small contract pieces built in the test (scripts/lib/asset/fixtures.mjs).
// Texture tests need KTX-Software's `ktx` (D-43, a machine install); where it is missing (CI) they
// are skipped and say so.

const ktx = await findKtx().then(
  (found) => found,
  () => null,
);
if (!ktx) console.warn("[asset pipeline] ktx not found on PATH: the KTX2 texture tests are skipped");

type Parts = ReturnType<typeof buildFixture>;

const roots: string[] = [];
afterEach(async () => {
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

type Setup = { root: string; sourceRoot: string; outDir: string; manifestFile: string; docsFile: string };

async function setup(slug: string, glb: Uint8Array, chapter = "shared"): Promise<Setup> {
  const root = await mkdtemp(path.join(os.tmpdir(), "asset-test-"));
  roots.push(root);
  const sourceRoot = path.join(root, "Blender Assets");
  await mkdir(path.join(sourceRoot, chapter, "export"), { recursive: true });
  await writeFile(path.join(sourceRoot, chapter, "export", `${slug}.glb`), glb);
  const outDir = path.join(root, "public", "assets");
  await mkdir(outDir, { recursive: true });
  const manifestFile = path.join(root, "manifest.generated.ts");
  await writeFile(manifestFile, renderManifest([]));
  const docsFile = path.join(root, "assets.md");
  await writeFile(docsFile, `# Assets\n\n${DOCS_START}\n${DOCS_END}\n\nHand-written part stays.\n`);
  return { root, sourceRoot, outDir, manifestFile, docsFile };
}

function run(s: Setup, key: string, assetBudgets = budgets.assets, extra: Record<string, unknown> = {}) {
  return runAssetPipeline({ key, repoRoot: process.cwd(), ...s, budgets: assetBudgets, today: () => "2026-11-26", ...extra });
}

async function snapshot(s: Setup) {
  const files: Record<string, string> = {};
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files[path.relative(s.root, full).replaceAll("\\", "/")] = (await readFile(full)).toString("base64");
    }
  };
  await walk(s.outDir);
  files.manifest = await readFile(s.manifestFile, "utf8");
  files.docs = await readFile(s.docsFile, "utf8");
  return files;
}

describe("asset key", () => {
  it("accepts <chapter>/<slug> for the scroll chapters and shared", () => {
    expect(parseAssetKey("shared/pipeline-test")).toEqual({ chapter: "shared", slug: "pipeline-test" });
    expect(parseAssetKey("port/monolith")).toEqual({ chapter: "port", slug: "monolith" });
    expect(parseAssetKey("world/thing").error).toMatch(/chapter "world"/);
    expect(parseAssetKey("shared/Bad_Slug").error).toMatch(/slug/);
    expect(parseAssetKey("pipeline-test").error).toMatch(/<chapter>\/<slug>/);
  });
});

describe("a valid piece", () => {
  it("passes, writes both variants, the manifest and the docs table, and keeps the contract", async () => {
    const s = await setup("fixture-test", await fixtureGlb());
    const result = await run(s, "shared/fixture-test");
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    const folder = path.join(s.outDir, "shared", "fixture-test");
    expect((await readdir(folder)).sort()).toEqual(["fixture-test-high.glb", "fixture-test-low.glb"]);

    const [entry] = parseManifest(await readFile(s.manifestFile, "utf8"));
    expect(entry).toMatchObject({
      key: "shared/fixture-test",
      chapter: "shared",
      slug: "fixture-test",
      date: "2026-11-26",
      licence: "owner, all rights reserved",
      triangles: 48,
      trianglesDrawn: 72, // the pin once per INST_ copy (3), never in place
      objects: 11,
      clips: [{ name: "shared_box_rise", duration: 1 }],
      instances: [{ prop: "pin", source: "shared_pin", count: 3 }],
      empties: { ANCHOR: ["ANCHOR_shared"], HOTSPOT: ["HOTSPOT_slot_01", "HOTSPOT_slot_02"], INST: ["INST_pin_001", "INST_pin_002", "INST_pin_003"], GLOW: ["GLOW_accent_01"] },
    });
    expect(entry.materials.map((m: { kind: string }) => m.kind).sort()).toEqual(["GLOW", "PBR", "SHADER"]);
    expect(entry.files.high.bytes).toBe((await readFile(path.join(folder, "fixture-test-high.glb"))).byteLength);

    // The compressed file: Meshopt + quantization, empties, names, COLOR_0 and the clip kept.
    const io = await createIO();
    const doc = await io.readBinary(new Uint8Array(await readFile(path.join(folder, "fixture-test-high.glb"))));
    const used = doc.getRoot().listExtensionsUsed().map((e) => e.extensionName).sort();
    expect(used).toEqual(["EXT_meshopt_compression", "KHR_mesh_quantization"]);
    const names = doc.getRoot().listNodes().map((n) => n.getName());
    for (const n of ["ANCHOR_shared", "HOTSPOT_slot_01", "GLOW_accent_01", "INST_pin_003", "shared_pin", "shared_box", "shared_panel"]) expect(names).toContain(n);
    const panel = doc.getRoot().listMeshes().find((m) => m.getName() === "shared_panel")!;
    expect(panel.listPrimitives()[0].getAttribute("COLOR_0")).not.toBeNull();
    expect(panel.listPrimitives()[0].getAttribute("TEXCOORD_0")).not.toBeNull(); // UVs of an untextured SHADER_ surface stay
    expect(doc.getRoot().listAnimations().map((a) => a.getName())).toEqual(["shared_box_rise"]);

    const docs = await readFile(s.docsFile, "utf8");
    expect(docs).toContain("| `fixture-test` | shared | `shared/export/fixture-test.glb`");
    expect(docs).toContain("Hand-written part stays.");
  });

  it("strips TANGENT only where the material has no normal map", async () => {
    const glb = await fixtureGlb({
      mutate: (doc: Document, parts: Parts) => {
        for (const mesh of doc.getRoot().listMeshes()) {
          const prim = mesh.listPrimitives()[0];
          const count = prim.getAttribute("POSITION")!.getCount();
          prim.setAttribute("TANGENT", doc.createAccessor().setType("VEC4").setArray(new Float32Array(count * 4).fill(1)).setBuffer(parts.buffer));
        }
      },
    });
    const s = await setup("tangents", glb);
    const result = await run(s, "shared/tangents");
    expect(result.ok).toBe(true);
    expect(result.report!.tangentsStripped).toBe(4); // no normal map anywhere in this piece
  });
});

describe("over budget", () => {
  it("fails with a message naming the limit and writes nothing", async () => {
    const s = await setup("too-big", await fixtureGlb());
    const before = await snapshot(s);
    const tight = { ...budgets.assets, slugs: { "shared/too-big": { triangles: 10, materials: 2, objects: 5, clips: 0 } } } as unknown as typeof budgets.assets;
    const result = await run(s, "shared/too-big", tight);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/triangles \(drawn\): 72 > 10 \(budgets\.config\.mjs assets\.slugs\["shared\/too-big"\]\.triangles\)/);
    expect(result.errors.join("\n")).toMatch(/materials: 3 > 2/);
    expect(result.errors.join("\n")).toMatch(/objects: 11 > 5/);
    expect(result.errors.join("\n")).toMatch(/clips: 1 > 0/);
    expect(await snapshot(s)).toEqual(before);
    expect(existsSync(path.join(s.outDir, "shared"))).toBe(false);
  });

  it("checks image count and sizes against the slug's sides, largest first", () => {
    const stats = {
      trianglesDrawn: 1,
      materials: [],
      objects: 1,
      clips: [],
      images: [
        { name: "a", width: 1024, height: 1024 },
        { name: "b", width: 1024, height: 512 },
        { name: "c", width: 256, height: 256 },
      ],
    };
    const budget = resolveBudget({ chapter: budgets.assets.chapter, slugs: { "shared/x": { images: { count: 2, sides: [1024, 512] } } } }, "shared", "x");
    const errors = checkInputBudget(stats, budget);
    expect(errors).toEqual([
      expect.stringMatching(/^images: 3 > 2/),
      expect.stringMatching(/^image "b": 1024 × 512 > 512 \(image 2 by size/),
    ]);
  });

  it("pipeline-test's own limits are the item's (≤ 5 000 triangles, 4 materials, 2 images 1024 and 512, 13 objects, 1 clip)", () => {
    expect(budgets.assets.slugs["shared/pipeline-test"]).toMatchObject({
      triangles: 5000,
      materials: 4,
      images: { count: 2, sides: [1024, 512] },
      objects: 13,
      clips: 1,
      lowSimplify: false,
    });
  });
});

describe("contract violations", () => {
  it("bad material, mesh and empty names fail with every problem listed", async () => {
    const glb = await fixtureGlb({
      mutate: (doc: Document, parts: Parts) => {
        parts.materials.pbr.setName("Steel");
        parts.nodes.shared_strip.setName("GlowStrip");
        parts.nodes.shared_strip.getMesh()!.setName("GlowStrip.mesh");
        parts.nodes.HOTSPOT_slot_02.setName("Empty.001");
        parts.nodes.ANCHOR_shared.setName("ANCHOR_port");
        parts.nodes.shared_panel.setScale([2, 2, 2]);
      },
    });
    const s = await setup("bad-names", glb);
    const before = await snapshot(s);
    const result = await run(s, "shared/bad-names");
    expect(result.ok).toBe(false);
    const all = result.errors.join("\n");
    expect(all).toMatch(/material "Steel": the name must be BAKED_<set>, PBR_<name>, SHADER_<name> or GLOW_<name>/);
    expect(all).toMatch(/mesh object "GlowStrip": the name must be shared_<element>/);
    expect(all).toContain('mesh data "GlowStrip.mesh" (object "GlowStrip"): the name must be shared_<element>');
    expect(all).toMatch(/empty "Empty\.001": the name must be ANCHOR_shared, HOTSPOT_<name>, INST_<prop>_<nnn> or GLOW_<name>/);
    expect(all).toMatch(/empty "ANCHOR_port": an anchor must be named after its chapter, ANCHOR_shared/);
    expect(all).toMatch(/node "shared_panel": scale \(2, 2, 2\)/);
    expect(result.errors.length).toBeGreaterThanOrEqual(6);
    expect(await snapshot(s)).toEqual(before);
  });

  it("an INST_ empty without its source mesh fails", async () => {
    const glb = await fixtureGlb({ mutate: (doc: Document, parts: Parts) => parts.scene.addChild(doc.createNode("INST_bolt_001").setTranslation([0.1, 0, 0])) });
    const s = await setup("no-source", glb);
    const result = await run(s, "shared/no-source");
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.stringMatching(/INST_bolt_\*: no source mesh "shared_bolt"/));
  });

  it("an instance source away from the origin fails", async () => {
    const glb = await fixtureGlb({ mutate: (_doc: Document, parts: Parts) => parts.nodes.shared_pin.setTranslation([1, 0, 0]) });
    const result = await run(await setup("moved-source", glb), "shared/moved-source");
    expect(result.errors).toContainEqual(expect.stringMatching(/instance source "shared_pin": must sit at the origin/));
  });

  it("a clip not named <object>_<verb> fails", async () => {
    const glb = await fixtureGlb({ mutate: (doc: Document) => doc.getRoot().listAnimations()[0].setName("Action.001") });
    const result = await run(await setup("bad-clip", glb), "shared/bad-clip");
    expect(result.errors).toContainEqual(expect.stringMatching(/clip "Action\.001": the name must be <object>_<verb>, where <object> is the node it animates \(shared_box\)/));
  });

  it("an unknown SHADER_ name is a loud warning, not a failure", async () => {
    const glb = await fixtureGlb({ mutate: (_doc: Document, parts: Parts) => parts.materials.shader.setName("SHADER_holo_grid") });
    const result = await run(await setup("unknown-shader", glb), "shared/unknown-shader");
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([expect.stringMatching(/material "SHADER_holo_grid": the site's shader library has no "holo_grid"/)]);
  });

  it("a camera in the file fails", async () => {
    const glb = await fixtureGlb({
      mutate: (doc: Document, parts: Parts) => parts.scene.addChild(doc.createNode("shared_cam").setCamera(doc.createCamera("cam").setType("perspective").setYFov(0.6).setZNear(0.1).setAspectRatio(1.5))),
    });
    const result = await run(await setup("camera", glb), "shared/camera");
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.stringMatching(/^cameras: the export holds 1 camera/));
  });

  it("a light in the file fails (and so does the extension it needs)", async () => {
    const glb = await fixtureGlb({
      mutate: (doc: Document, parts: Parts) => {
        const lights = doc.createExtension(KHRLightsPunctual);
        const light = lights.createLight("key").setType("point").setIntensity(10);
        parts.scene.addChild(doc.createNode("GLOW_lamp").setExtension("KHR_lights_punctual", light));
      },
    });
    const result = await run(await setup("light", glb), "shared/light");
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.stringMatching(/^extensions: the raw export uses KHR_lights_punctual/));
    expect(result.errors).toContainEqual(expect.stringMatching(/^lights: the export holds 1 light/));
  });

  it("a raw file that already uses an extension fails", async () => {
    // A fixture already compressed by the pipeline is not a raw export.
    const s = await setup("compressed", await fixtureGlb());
    await run(s, "shared/compressed");
    const compressed = await readFile(path.join(s.outDir, "shared", "compressed", "compressed-high.glb"));
    const t = await setup("recompressed", new Uint8Array(compressed));
    const result = await run(t, "shared/recompressed");
    expect(result.errors).toContainEqual(expect.stringMatching(/^extensions: the raw export uses EXT_meshopt_compression, KHR_mesh_quantization/));
  });
});

describe("deterministic output", () => {
  it("the same input gives byte-identical files (fresh output folders)", async () => {
    const glb = await fixtureGlb();
    const a = await setup("same", glb);
    const b = await setup("same", glb);
    expect((await run(a, "shared/same")).ok).toBe(true);
    expect((await run(b, "shared/same")).ok).toBe(true);
    const strip = (snap: Record<string, string>) => Object.fromEntries(Object.entries(snap).map(([k, v]) => [k.replace(/^public\//, ""), v]));
    expect(strip(await snapshot(a))).toEqual(strip(await snapshot(b)));
  });

  it("a re-run over its own output changes nothing, and keeps the date", async () => {
    const s = await setup("rerun", await fixtureGlb());
    await run(s, "shared/rerun");
    const first = await snapshot(s);
    await runAssetPipeline({ key: "shared/rerun", repoRoot: process.cwd(), ...s, budgets: budgets.assets, today: () => "2027-01-01" });
    expect(await snapshot(s)).toEqual(first);
  });
});

describe.skipIf(!ktx)("KTX2 textures (needs ktx on PATH)", () => {
  async function bake(size: number) {
    // A dark gradient like a bake: values 20–80 / 255.
    const pixels = Buffer.alloc(size * size * 3);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) pixels.fill(20 + Math.round((60 * (x + y)) / (2 * size)), (y * size + x) * 3, (y * size + x) * 3 + 3);
    return new Uint8Array(await sharp(pixels, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer());
  }

  it("encodes KTX2 per tier (high full size, low half), sRGB for the bake, and records both candidates", async () => {
    const s = await setup("textured", await fixtureGlb({ bake: await bake(64) }));
    const result = await run(s, "shared/textured", budgets.assets, { ktxBin: ktx!.bin });
    expect(result.errors).toEqual([]);
    const [entry] = parseManifest(await readFile(s.manifestFile, "utf8"));
    const [texture] = entry.textures;
    expect(texture).toMatchObject({ name: "BAKED_test_bench", slots: ["baseColorTexture"], colorSpace: "srgb", high: { width: 64, height: 64 }, low: { width: 32, height: 32 } });
    expect(texture.candidates.map((c: { codec: string }) => c.codec)).toEqual(["etc1s", "uastc"]);
    expect(["etc1s", "uastc"]).toContain(texture.codec);
    const io = await createIO();
    for (const variant of ["high", "low"] as const) {
      const doc = await io.readBinary(new Uint8Array(await readFile(path.join(s.outDir, "shared", "textured", `textured-${variant}.glb`))));
      expect(doc.getRoot().listTextures()[0].getMimeType()).toBe("image/ktx2");
      expect(doc.getRoot().listTextures()[0].getSize()).toEqual(variant === "high" ? [64, 64] : [32, 32]);
      expect(doc.getRoot().listExtensionsUsed().map((e) => e.extensionName)).toContain("KHR_texture_basisu");
    }
  });

  it("a re-run with textures is byte-identical", async () => {
    const s = await setup("textured-again", await fixtureGlb({ bake: await bake(64) }));
    await run(s, "shared/textured-again", budgets.assets, { ktxBin: ktx!.bin });
    const first = await snapshot(s);
    await run(s, "shared/textured-again", budgets.assets, { ktxBin: ktx!.bin });
    expect(await snapshot(s)).toEqual(first);
  });

  it("a texture over the chapter's largest side fails and writes nothing", async () => {
    const s = await setup("huge", await fixtureGlb({ bake: await bake(64) }));
    const before = await snapshot(s);
    const result = await run(s, "shared/huge", { ...budgets.assets, chapter: { ...budgets.assets.chapter, images: { count: null, sides: [32] } } } as typeof budgets.assets, { ktxBin: ktx!.bin });
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.stringMatching(/image "BAKED_test_bench": 64 × 64 > 32/));
    expect(await snapshot(s)).toEqual(before);
  });
});

describe("ktx tool", () => {
  it("accepts a stable release from 4.3 on, refuses pre-releases and older versions", () => {
    expect(checkKtxVersion("ktx version: v4.4.2\n")).toEqual({ version: "v4.4.2" });
    expect(checkKtxVersion("ktx version: v5.0.0-rc2").error).toMatch(/pre-release/);
    expect(checkKtxVersion("ktx version: v4.2.1").error).toMatch(/older than v4\.3\.0/);
    expect(checkKtxVersion("nonsense").error).toMatch(/could not read/);
  });

  it("reads level 0's quality from --compare-ssim --compare-psnr", () => {
    const out = "Level 0:\n    SSIM R: +0.988145, G: +0.998150, B: +0.982738\n    PSNR: 53.631050\nLevel 1:\n    SSIM R: +0.9, G: +0.9, B: +0.9\n    PSNR: 50\n";
    expect(parseCompare(out)).toEqual({ ssim: 0.982738, ssimChannels: [0.988145, 0.99815, 0.982738], psnr: 53.63105 });
  });

  it("a missing tool gives a clear message", async () => {
    await expect(findKtx("ktx-not-installed-here")).rejects.toThrow(/not found\. Install KTX-Software v4\.4\.2/);
  });
});

describe("fixture sanity", () => {
  it("the fixture itself is a raw piece (no extensions)", async () => {
    const { doc } = buildFixture();
    expect(doc.getRoot().listExtensionsUsed()).toEqual([]);
  });
});
