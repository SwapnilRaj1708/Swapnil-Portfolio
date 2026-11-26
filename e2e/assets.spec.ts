import { readFileSync } from "node:fs";
import { expect, type Page, test } from "./fixtures";
import { JOURNEY_ENABLED } from "../src/config/journey";
import { findAsset } from "../src/lib/journey/assets/manifest";

// PF-009: the asset pipeline's output in the browser.
//
// The test process shares the web server's environment (playwright.config.ts), so these flags are
// the build's: the asset lab (/dev/assets) exists only in builds made with ENABLE_DEV_PAGES=1
// (run: `$env:ENABLE_DEV_PAGES="1"; npx --no-install playwright test e2e/assets.spec.ts`); the
// production group runs on a VERCEL_ENV=production build. The headless shell renders with
// SwiftShader: KTX2 textures transcode to whatever it supports (uncompressed if nothing else),
// which is enough for every check here – nothing depends on pixels.

const ENTRY = findAsset("shared/pipeline-test")!;
// three's REVISION is its minor version (0.187.0 → "187"); read from its package.json, so the test
// runner does not load three.js itself.
const THREE_REVISION = JSON.parse(readFileSync("node_modules/three/package.json", "utf8")).version.split(".")[1];
const DECODERS = `/decoders/three-r${THREE_REVISION}/`;
const LAB = "/dev/assets?tier=high&gpu=low-power";

type Lab = NonNullable<Window["__assetLab"]>;

function watch(page: Page) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const requests: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
    if (msg.type() === "warning") warnings.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("request", (req) => requests.push(req.url()));
  return { errors, warnings, requests };
}

async function openLab(page: Page, url = LAB) {
  await page.goto(url);
  await page.waitForFunction(() => window.__assetLab?.snapshot().state === "loaded", null, { timeout: 60_000 });
  // A few frames, so the renderer has uploaded everything.
  await page.waitForTimeout(500);
}

const snap = (page: Page) => page.evaluate(() => window.__assetLab!.snapshot());
const lab = <K extends keyof Lab>(page: Page, key: K, ...args: unknown[]) =>
  page.evaluate(
    ([k, a]) => (window.__assetLab![k as keyof Lab] as unknown as (...x: unknown[]) => unknown)(...(a as unknown[])),
    [key, args] as const,
  );

test.describe("asset lab /dev/assets (dev-pages builds)", () => {
  test.skip(process.env.ENABLE_DEV_PAGES !== "1" || !JOURNEY_ENABLED, "the asset lab is built only with ENABLE_DEV_PAGES=1 (and the 3D layer)");
  test.describe.configure({ timeout: 120_000 });

  test("loads pipeline-test with zero console errors, from the site's own host only", async ({ page, baseURL }) => {
    const seen = watch(page);
    await openLab(page);
    expect(seen.errors).toEqual([]);
    const origin = new URL(baseURL!).origin;
    const foreign = seen.requests.filter((u) => !u.startsWith(origin) && !u.startsWith("blob:") && !u.startsWith("data:"));
    const hosts = [...new Set(seen.requests.map((u) => (u.startsWith("blob:") || u.startsWith("data:") ? u.slice(0, 5) : new URL(u).host)))];
    console.log(`[asset hosts] ${hosts.join(", ")}`);
    expect(foreign).toEqual([]);
    const paths = seen.requests.filter((u) => u.startsWith(origin)).map((u) => new URL(u).pathname);
    // The decoders and the transcoder come from the site, from the folder of this three.js revision.
    expect(paths).toContain(`${DECODERS}meshopt_decoder.module.js`);
    expect(paths).toContain(`${DECODERS}basis/basis_transcoder.js`);
    expect(paths).toContain(`${DECODERS}basis/basis_transcoder.wasm`);
    expect(paths).toContain(`/assets/shared/pipeline-test/${ENTRY.files.high.file}`);
    expect(paths.filter((p) => p.includes("basis_transcoder") && !p.startsWith(DECODERS))).toEqual([]);
  });

  test("every contract feature is applied: kinds, instancing, registries, labels, the clip", async ({ page }) => {
    await openLab(page);
    const s = await snap(page);
    expect(s.meshes.map((m) => [m.name, m.kind, m.copies])).toEqual([
      ["INST_pin", "PBR", 4],
      ["shared_bench_base", "BAKED", 1],
      ["shared_glow_strip", "GLOW", 1],
      ["shared_test_cube", "PBR", 1],
      ["shared_test_panel", "SHADER", 1],
    ]);
    expect(s.instances).toEqual([{ prop: "pin", source: "shared_pin", count: 4 }]);
    expect(s.render).toEqual({ calls: 5, triangles: 1120 }); // the pin source is never drawn in place
    for (const name of ["ANCHOR_shared", "HOTSPOT_slot_01", "HOTSPOT_slot_02", "GLOW_accent_01"]) {
      await expect(page.locator(`[data-point="${name}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-readout="points"]')).toContainText("HOTSPOT_slot_01");
    // The clip: forwards, and backwards to the same poses (Blender report: 0.20 m / 0°, 0.30 m / 90°).
    const pose = async (p: number) => {
      await lab(page, "scrub", p);
      return (await lab(page, "cube")) as { y: number; turnDegrees: number };
    };
    const start = await pose(0);
    const middle = await pose(0.5);
    const end = await pose(1);
    expect(start.y).toBeCloseTo(0.2, 2);
    expect(start.turnDegrees).toBeCloseTo(0, 0);
    expect(middle.y).toBeGreaterThan(0.26);
    expect(middle.y).toBeLessThan(0.28);
    expect(end.y).toBeCloseTo(0.3, 2);
    expect(end.turnDegrees).toBeCloseTo(90, 0);
    expect(await pose(0.5)).toEqual(middle);
    expect(await pose(0)).toEqual(start);
  });

  test("load → unload returns the renderer's memory counters to their baseline", async ({ page }) => {
    await openLab(page);
    const loaded = await snap(page);
    expect(loaded.baseline).not.toBeNull();
    expect(loaded.memory.geometries).toBeGreaterThan(loaded.baseline!.geometries);
    expect(loaded.memory.textures).toBeGreaterThan(loaded.baseline!.textures);
    for (let round = 0; round < 2; round++) {
      await lab(page, "unload");
      await page.waitForTimeout(300);
      const after = await snap(page);
      console.log(`[asset memory] round ${round + 1}: loaded ${JSON.stringify(loaded.memory)} → unloaded ${JSON.stringify(after.memory)}, baseline ${JSON.stringify(after.baseline)}`);
      expect({ geometries: after.memory.geometries, textures: after.memory.textures }).toEqual(after.baseline);
      expect(after.memory.programs).toBe(0);
      expect(after.render.calls).toBe(0);
      await lab(page, "load");
      await page.waitForTimeout(300);
    }
    await expect(page.locator('[data-readout="state"]')).toHaveText("loaded");
  });

  test("the tier switch: high and medium load -high, low loads -low (half-size textures), static loads nothing", async ({ page, baseURL }) => {
    const seen = watch(page);
    await openLab(page);
    const sizes = async () => (await snap(page)).textures.map((t) => `${t.name} ${t.width}`);
    expect(await sizes()).toEqual(["BAKED_pipeline_bench 1024", "PBR_test_metal_normal 512"]);
    await lab(page, "setTier", "low");
    await page.waitForFunction(() => window.__assetLab!.snapshot().state === "loaded");
    await page.waitForTimeout(300);
    expect((await snap(page)).variant).toBe("low");
    expect(await sizes()).toEqual(["BAKED_pipeline_bench 512", "PBR_test_metal_normal 256"]);
    expect(seen.requests).toContain(`${new URL(baseURL!).origin}/assets/shared/pipeline-test/${ENTRY.files.low.file}`);
    await lab(page, "setTier", "medium");
    await page.waitForFunction(() => window.__assetLab!.snapshot().state === "loaded");
    expect((await snap(page)).variant).toBe("high");
    await lab(page, "setTier", "static");
    await page.waitForTimeout(300);
    const s = await snap(page);
    expect(s.state).toBe("static");
    expect(s.meshes).toEqual([]);
    expect(s.memory.geometries).toBe(s.baseline!.geometries);
    expect(seen.errors).toEqual([]);
  });

  test("the progress signal reaches 100 % from real streamed bytes", async ({ page }) => {
    const sizes: number[] = [];
    page.on("response", async (res) => {
      if (res.url().endsWith(ENTRY.files.high.file)) sizes.push((await res.body()).byteLength);
    });
    await openLab(page);
    const events = (await page.evaluate(() => window.__assetLab!.progressEvents.slice())) as number[];
    const total = ENTRY.files.high.bytes;
    console.log(`[asset progress] ${events.length} updates: ${events.slice(0, 12).join(", ")}`);
    expect(events[0]).toBe(0);
    expect(events.at(-1)).toBe(total);
    for (let i = 1; i < events.length; i++) expect(events[i]).toBeGreaterThanOrEqual(events[i - 1]);
    expect(sizes).toEqual([total]); // the manifest's size is the size that arrived
    await expect(page.locator('[data-readout="progress"]')).toContainText("(100 %)");
  });

  test("an unknown SHADER_ name: a loud development warning and the fallback material", async ({ page }) => {
    const seen = watch(page);
    await openLab(page);
    await lab(page, "setUnknownShader", true);
    await page.waitForFunction(() => window.__assetLab!.snapshot().state === "loaded");
    const panel = (await snap(page)).meshes.find((m) => m.name === "shared_test_panel")!;
    expect(panel).toMatchObject({ kind: "SHADER", fallback: true });
    expect(seen.warnings.some((w) => /\[assets\] WARNING – shared\/pipeline-test: material "SHADER_test_grid" names a shader the library does not have/.test(w))).toBe(true);
    expect(seen.errors).toEqual([]);
  });
});

test.describe("home page and chapter assets (builds with the 3D layer)", () => {
  test.skip(!JOURNEY_ENABLED, "this build is the production deployment (D-39)");

  test("until PF-010 wires chapter assets, the home page requests no asset and no decoder", async ({ page }) => {
    const seen = watch(page);
    await page.goto("/?tier=high");
    await page.waitForFunction(() => window.__journey?.ready === true, null, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    const assets = await page.evaluate(() => window.__journey?.assets?.() ?? null);
    expect(assets).toMatchObject({ loaded: [], wanted: [] });
    expect(seen.requests.filter((u) => u.includes("/decoders/") || u.includes("/assets/shared/"))).toEqual([]);
  });
});

test.describe("production deployment (D-39): no decoders", () => {
  test.skip(JOURNEY_ENABLED, "this build has the 3D layer");

  test("the site serves no decoder, and pages request none", async ({ page, request }) => {
    expect((await request.get(`${DECODERS}meshopt_decoder.module.js`)).status()).toBe(404);
    expect((await request.get(`${DECODERS}basis/basis_transcoder.wasm`)).status()).toBe(404);
    const seen = watch(page);
    await page.goto("/?tier=high");
    await page.waitForLoadState("networkidle");
    expect(seen.requests.filter((u) => u.includes("/decoders/") || u.includes("/assets/"))).toEqual([]);
    // Accepted for the test piece (PF-009): files in public/ are reachable on the live domain.
    expect((await request.get(`/assets/shared/pipeline-test/${ENTRY.files.low.file}`)).status()).toBe(200);
  });
});
