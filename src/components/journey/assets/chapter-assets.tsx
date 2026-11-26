"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { assetLoadingTuning, assetsToUnload, chapterAssetRegistry, planChapterAssets } from "@/lib/journey/assets/chapter-plan";
import { ASSET_MANIFEST, findAsset, variantForTier, type AssetManifestEntry } from "@/lib/journey/assets/manifest";
import { CHAPTER_IDS } from "@/lib/journey/chapters";
import { countRender, journeyDebug } from "@/lib/journey/debug";
import { scrollStore } from "@/lib/journey/scroll-store";
import { journeyStore, loadingStore } from "@/lib/journey/store";
import { isRenderTier } from "@/lib/journey/tiers";
import { AssetManager } from "./asset-manager";

/** Development behaviour of the loaders (loud warnings, obvious fallbacks): `next dev` and dev-tools builds. */
export const ASSETS_DEV = process.env.NODE_ENV === "development" || process.env.JOURNEY_DEV_TOOLS === "on";

let replan: (() => void) | null = null;

/** Re-applies the chapter rules now (the dev panel calls it after changing the tuning). */
export function requestAssetPlan(): void {
  replan?.();
}

/**
 * Per-chapter assets in the journey canvas (STANDARDS.md §1): the chapter registry built from the
 * manifest, the current chapter loaded, the next one preloaded, chapters further than
 * `assetLoadingTuning.keep` away unloaded (chapter-plan.ts). It follows the scroll store's chapter
 * and the tier (high and medium load `-high`, low `-low`; leaving for static unmounts the canvas,
 * which unloads everything). Nothing re-renders through React: both stores are subscribed to.
 *
 * Until PF-010 wires the chapters' real assets, no manifest entry belongs to a scroll chapter
 * (the pipeline test piece is in `shared`), so the home page loads nothing and requests no decoder.
 */
export function ChapterAssets() {
  countRender("ChapterAssets");
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const manager = new AssetManager({
      renderer: gl,
      parent: scene,
      dev: ASSETS_DEV,
      tier: () => {
        const tier = journeyStore.getState().tier;
        return isRenderTier(tier) ? tier : "low";
      },
    });
    const registry = chapterAssetRegistry(ASSET_MANIFEST, CHAPTER_IDS);
    let wanted: string[] = [];
    const apply = () => {
      const scroll = scrollStore.getState();
      const plan = planChapterAssets({
        registry,
        current: scroll.active ? scroll.chapterIndex : -1,
        ahead: assetLoadingTuning.ahead,
        keep: assetLoadingTuning.keep,
      });
      wanted = plan.wanted;
      const entries = plan.wanted.map((key) => findAsset(key)).filter((e): e is AssetManifestEntry => e !== null);
      manager.sync(entries, variantForTier(journeyStore.getState().tier), assetsToUnload(manager.keys(), plan));
    };
    replan = apply;
    apply();
    const offScroll = scrollStore.subscribe((now, before) => {
      if (now.chapterIndex !== before.chapterIndex || now.active !== before.active) apply();
    });
    const offTier = journeyStore.subscribe((now, before) => {
      if (now.tier !== before.tier) apply();
    });
    const debug = journeyDebug();
    if (debug) debug.assets = () => ({ loaded: manager.keys(), wanted: [...wanted], loading: loadingStore.getState() });
    return () => {
      offScroll();
      offTier();
      if (replan === apply) replan = null;
      if (debug) debug.assets = null;
      manager.dispose();
    };
  }, [gl, scene]);

  return null;
}
