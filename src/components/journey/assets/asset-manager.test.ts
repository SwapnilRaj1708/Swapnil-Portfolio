// @vitest-environment node
import { Group, type WebGLRenderer } from "three";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { listPoints, pointsStore, resetPointsForTests } from "@/lib/journey/assets/points";
import { loadingFraction, loadingStore, resetLoadingStoreForTests } from "@/lib/journey/store";
import { AssetManager } from "./asset-manager";
import type { AssetLoaders } from "./decoders";
import { chunkedResponse, loader, memoryCounter, pipelineFixture } from "./test-helpers";

// PF-009: loading, progress from real streamed bytes, the registries, per-tier variants, unloading
// and disposal, and the sync rules – with the pipeline's real output, three's GLTFLoader and a
// fetch that streams the file in chunks.

let fixture: Awaited<ReturnType<typeof pipelineFixture>>;
beforeAll(async () => {
  fixture = await pipelineFixture();
}, 60_000);

beforeEach(() => {
  resetLoadingStoreForTests();
  resetPointsForTests();
});

function setup(chunk = 1000) {
  const parent = new Group();
  const requests: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    requests.push(u);
    return chunkedResponse(u.endsWith("-low.glb") ? fixture.low.slice(0) : fixture.high.slice(0), chunk);
  }) as unknown as typeof fetch;
  const loaders = vi.fn(async (): Promise<AssetLoaders> => ({ gltf: await loader(), ktx2: null as never, dispose: vi.fn() }));
  const manager = new AssetManager({ renderer: {} as WebGLRenderer, parent, tier: () => "high", dev: false, loaders, fetchImpl });
  return { manager, parent, requests, loaders };
}

describe("AssetManager", () => {
  it("loads a variant with progress from the streamed bytes, adds it to the scene and registers its points", async () => {
    const { manager, parent, requests } = setup(1000);
    const seen: number[] = [];
    const off = loadingStore.subscribe((s) => seen.push(s.assets[fixture.entry.key]?.loaded ?? -1));
    const asset = await manager.load(fixture.entry, "high");
    off();
    expect(asset).not.toBeNull();
    expect(requests).toEqual(["/assets/shared/loader-test/loader-test-high.glb"]);
    // Real progress: one update per chunk, rising to the file's size.
    const total = fixture.entry.files.high.bytes;
    expect(seen.filter((n) => n > 0 && n < total).length).toBeGreaterThan(3);
    expect(seen.at(-1)).toBe(total);
    expect(loadingStore.getState().assets[fixture.entry.key]).toEqual({ loaded: total, total, state: "loaded" });
    expect(loadingFraction()).toBe(1);
    expect(parent.children).toContain(asset!.root);
    expect(listPoints("hotspot").map((p) => p.name)).toEqual(["HOTSPOT_slot_01", "HOTSPOT_slot_02"]);
  });

  it("the same variant twice is one request; another variant replaces it", async () => {
    const { manager, requests } = setup();
    const [a, b] = await Promise.all([manager.load(fixture.entry, "high"), manager.load(fixture.entry, "high")]);
    expect(a).toBe(b);
    expect(requests).toHaveLength(1);
    const low = await manager.load(fixture.entry, "low");
    expect(low).not.toBe(a);
    expect(manager.variantOf(fixture.entry.key)).toBe("low");
    expect(requests.at(-1)).toBe("/assets/shared/loader-test/loader-test-low.glb");
  });

  it("unload frees everything: memory counters back to baseline, points and progress gone", async () => {
    const { manager, parent } = setup();
    const counter = memoryCounter();
    const baseline = counter.counts();
    await manager.load(fixture.entry, "high");
    counter.upload(parent);
    expect(counter.counts().geometries).toBeGreaterThan(0);
    manager.unload(fixture.entry.key);
    expect(counter.counts()).toEqual(baseline);
    expect(parent.children).toHaveLength(0);
    expect(pointsStore.getState().byAsset).toEqual({});
    expect(loadingStore.getState()).toEqual({ assets: {}, loaded: 0, total: 0 });
  });

  it("unloading while loading cancels: nothing is added", async () => {
    const { manager, parent } = setup(500);
    const pending = manager.load(fixture.entry, "high");
    manager.unload(fixture.entry.key);
    expect(await pending).toBeNull();
    expect(parent.children).toHaveLength(0);
    expect(loadingStore.getState().assets).toEqual({});
  });

  it("a failed request is reported as failed, never thrown", async () => {
    const parent = new Group();
    const manager = new AssetManager({
      renderer: {} as WebGLRenderer,
      parent,
      tier: () => "high",
      dev: false,
      loaders: async () => ({ gltf: await loader(), ktx2: null as never, dispose: () => {} }),
      fetchImpl: (async () => new Response("no", { status: 404 })) as unknown as typeof fetch,
    });
    expect(await manager.load(fixture.entry, "high")).toBeNull();
    expect(loadingStore.getState().assets[fixture.entry.key].state).toBe("failed");
  });

  it("sync: wanted totals count at once, loads run in order, a null variant (static) unloads everything", async () => {
    const { manager, parent } = setup();
    manager.sync([fixture.entry], "high", []);
    expect(loadingStore.getState().total).toBe(fixture.entry.files.high.bytes); // before a byte arrives
    await vi.waitFor(() => expect(manager.get(fixture.entry.key)).not.toBeNull());
    expect(parent.children).toHaveLength(1);
    manager.sync([], "high", [fixture.entry.key]);
    expect(parent.children).toHaveLength(0);
    manager.sync([fixture.entry], "high", []);
    await vi.waitFor(() => expect(manager.get(fixture.entry.key)).not.toBeNull());
    manager.sync([fixture.entry], null, []);
    expect(manager.keys()).toEqual([]);
    expect(parent.children).toHaveLength(0);
  });

  it("dispose unloads everything and ends the decoders' workers; the decoders load only on the first load", async () => {
    const { manager, loaders } = setup();
    expect(loaders).not.toHaveBeenCalled();
    await manager.load(fixture.entry, "high");
    expect(loaders).toHaveBeenCalledOnce();
    const created = await loaders.mock.results[0].value;
    manager.dispose();
    await Promise.resolve();
    await Promise.resolve();
    expect(created.dispose).toHaveBeenCalled();
    expect(manager.keys()).toEqual([]);
  });
});
