import type { Object3D, WebGLRenderer } from "three";
import { assetUrl, type AssetManifestEntry, type AssetVariant } from "@/lib/journey/assets/manifest";
import { registerAssetPoints, unregisterAssetPoints } from "@/lib/journey/assets/points";
import { addAssetBytes, beginAssetLoad, endAssetLoad, forgetAsset, loadingStore } from "@/lib/journey/store";
import type { RenderTier } from "@/lib/journey/tiers";
import { applyAssetContract, type ContractAsset } from "./contract";
import { createAssetLoaders, type AssetLoaders } from "./decoders";
import { fetchWithProgress } from "./fetch-progress";
import type { ShaderLookup } from "./shaders/library";

/**
 * Loads pipeline assets into the scene and takes them out again (PF-009).
 *
 *   load(entry, variant)  fetch the variant's .glb with real streamed progress (loading store,
 *                         store.ts), parse it (KTX2 + Meshopt through the site's own decoders),
 *                         apply the contract (contract.ts), add it under `parent`, register its
 *                         anchors, hotspots and glow accents (points.ts);
 *   unload(key)           cancel or dispose: every geometry, material and texture of the asset is
 *                         freed, so the renderer's memory counters return to where they were;
 *   sync(wanted, …)       the chapter rules' result (chapter-plan.ts): loads what is wanted, in
 *                         order (one at a time: the current chapter first, then the preloads),
 *                         unloads what is no longer retained; `variant` null (static) unloads all.
 *
 * The decoders are created on the first load only, so a page that loads no asset never requests
 * the transcoder or the Meshopt decoder.
 */

export type AssetManagerOptions = {
  renderer: WebGLRenderer;
  parent: Object3D;
  /** The render tier now (shaders pick their low variant at `low`). */
  tier: () => RenderTier;
  /** Development behaviour (loud warnings, obvious shader fallback). */
  dev: boolean;
  /** Replaceable for tests: the glTF loader with its decoders. */
  loaders?: (renderer: WebGLRenderer) => Promise<AssetLoaders>;
  fetchImpl?: typeof fetch;
  shaders?: ShaderLookup;
  /** Called whenever an asset finished loading or was unloaded. */
  onChange?: () => void;
};

type Slot = {
  entry: AssetManifestEntry;
  variant: AssetVariant;
  controller: AbortController;
  promise: Promise<ContractAsset | null>;
  asset: ContractAsset | null;
};

export class AssetManager {
  private readonly slots = new Map<string, Slot>();
  private loaders: Promise<AssetLoaders> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private wanted = new Set<string>();
  private disposed = false;

  constructor(private readonly options: AssetManagerOptions) {}

  /** Keys loaded or loading. */
  keys(): string[] {
    return [...this.slots.keys()].sort();
  }

  /** A loaded asset (null while it is loading). */
  get(key: string): ContractAsset | null {
    return this.slots.get(key)?.asset ?? null;
  }

  variantOf(key: string): AssetVariant | null {
    return this.slots.get(key)?.variant ?? null;
  }

  load(entry: AssetManifestEntry, variant: AssetVariant): Promise<ContractAsset | null> {
    const existing = this.slots.get(entry.key);
    if (existing && existing.variant === variant) return existing.promise;
    if (existing) this.unload(entry.key);
    const controller = new AbortController();
    const total = entry.files[variant].bytes;
    if (loadingStore.getState().assets[entry.key]?.state !== "loading") beginAssetLoad(entry.key, total);
    const slot: Slot = { entry, variant, controller, asset: null, promise: Promise.resolve(null) };
    slot.promise = this.fetchAndApply(slot).catch((error: unknown) => {
      if (controller.signal.aborted) return null;
      endAssetLoad(entry.key, false);
      if (this.options.dev) console.warn(`[assets] ${entry.key} (${variant}) could not be loaded`, error);
      return null;
    });
    this.slots.set(entry.key, slot);
    return slot.promise;
  }

  private async fetchAndApply(slot: Slot): Promise<ContractAsset | null> {
    const { entry, variant, controller } = slot;
    this.loaders ??= (this.options.loaders ?? createAssetLoaders)(this.options.renderer);
    const loaders = await this.loaders;
    const bytes = await fetchWithProgress(assetUrl(entry, variant), {
      total: entry.files[variant].bytes,
      signal: controller.signal,
      onBytes: (n) => addAssetBytes(entry.key, n),
      fetchImpl: this.options.fetchImpl,
    });
    const gltf = await loaders.gltf.parseAsync(bytes, "");
    const asset = applyAssetContract(gltf.scene, gltf.animations, {
      key: entry.key,
      chapter: entry.chapter,
      tier: this.options.tier(),
      dev: this.options.dev,
      shaders: this.options.shaders,
    });
    if (controller.signal.aborted || this.disposed) {
      asset.dispose();
      return null;
    }
    slot.asset = asset;
    this.options.parent.add(asset.root);
    registerAssetPoints(entry.key, asset.points);
    endAssetLoad(entry.key, true);
    this.options.onChange?.();
    return asset;
  }

  unload(key: string): void {
    const slot = this.slots.get(key);
    if (!slot) return;
    this.slots.delete(key);
    slot.controller.abort();
    slot.asset?.dispose();
    unregisterAssetPoints(key);
    forgetAsset(key);
    if (slot.asset) this.options.onChange?.();
  }

  /**
   * Makes the loaded set follow a plan: `unload` keys go now; `wanted` entries load one after the
   * other in their order (skipped if no longer wanted when their turn comes). Their totals enter
   * the loading store at once, so overall progress covers everything wanted.
   */
  sync(wanted: readonly AssetManifestEntry[], variant: AssetVariant | null, unload: readonly string[]): void {
    if (this.disposed) return;
    for (const key of unload) this.unload(key);
    if (!variant) {
      this.wanted = new Set();
      for (const key of this.keys()) this.unload(key);
      return;
    }
    this.wanted = new Set(wanted.map((e) => e.key));
    for (const entry of wanted) {
      const slot = this.slots.get(entry.key);
      if (slot && slot.variant === variant) continue;
      if (!slot && loadingStore.getState().assets[entry.key] === undefined) beginAssetLoad(entry.key, entry.files[variant].bytes);
      this.queue = this.queue.then(async () => {
        if (this.disposed || !this.wanted.has(entry.key)) {
          if (!this.slots.has(entry.key)) forgetAsset(entry.key);
          return;
        }
        await this.load(entry, variant);
      });
    }
  }

  /** Unloads everything and ends the decoders' workers. */
  dispose(): void {
    this.disposed = true;
    this.wanted = new Set();
    for (const key of this.keys()) this.unload(key);
    const loaders = this.loaders;
    this.loaders = null;
    void loaders?.then((l) => l.dispose()).catch(() => undefined);
  }
}
