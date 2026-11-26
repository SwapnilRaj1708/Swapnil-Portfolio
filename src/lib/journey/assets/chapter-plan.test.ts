import { describe, expect, it } from "vitest";
import { CHAPTER_IDS } from "../chapters";
import { assetLoadingTuning, assetsToUnload, chapterAssetRegistry, planChapterAssets } from "./chapter-plan";
import { ASSET_MANIFEST } from "./manifest";
import type { AssetManifestEntry } from "./manifest-types";

// STANDARDS.md §1: the current chapter loads, the next one preloads, chapters further away unload.

const entry = (chapter: string, slug: string) => ({ key: `${chapter}/${slug}`, chapter, slug }) as AssetManifestEntry;
const manifest = [entry("port", "monolith"), entry("bus", "lanes"), entry("bus", "signals"), entry("memory", "banks"), entry("array", "slabs"), entry("core", "die"), entry("uplink", "spire"), entry("shared", "pipeline-test")];
const registry = chapterAssetRegistry(manifest, CHAPTER_IDS);
const plan = (current: number, ahead = 1, keep = 1) => planChapterAssets({ registry, current, ahead, keep });

describe("chapter asset registry", () => {
  it("groups the manifest by scroll chapter, in the registry's order; shared assets belong to none", () => {
    expect(registry).toEqual([["port/monolith"], ["bus/lanes", "bus/signals"], ["memory/banks"], ["array/slabs"], ["core/die"], ["uplink/spire"]]);
  });

  it("today's manifest has no scroll-chapter asset (the home page loads nothing until PF-010)", () => {
    expect(chapterAssetRegistry(ASSET_MANIFEST, CHAPTER_IDS).flat()).toEqual([]);
  });
});

describe("planChapterAssets", () => {
  it("loads the current chapter first, then preloads one ahead", () => {
    expect(plan(0).wanted).toEqual(["port/monolith", "bus/lanes", "bus/signals"]);
    expect(plan(2).wanted).toEqual(["memory/banks", "array/slabs"]);
    expect(plan(5).wanted).toEqual(["uplink/spire"]);
  });

  it("keeps one behind loaded, but does not fetch it", () => {
    const p = plan(2);
    expect(p.wanted).not.toContain("bus/lanes");
    expect([...p.retained!].sort()).toEqual(["array/slabs", "bus/lanes", "bus/signals", "memory/banks"]);
  });

  it("unloads chapters more than one behind or ahead", () => {
    const loaded = ["port/monolith", "bus/lanes", "bus/signals", "memory/banks", "array/slabs"];
    expect(assetsToUnload(loaded, plan(3))).toEqual(["bus/lanes", "bus/signals", "port/monolith"]);
    expect(assetsToUnload(loaded, plan(0))).toEqual(["array/slabs", "memory/banks"]);
  });

  it("follows the tuning: more ahead, a wider window, none at all", () => {
    expect(plan(0, 2).wanted).toEqual(["port/monolith", "bus/lanes", "bus/signals", "memory/banks"]);
    expect(assetsToUnload(["port/monolith"], plan(2, 1, 2))).toEqual([]);
    expect(plan(1, 0, 0).wanted).toEqual(["bus/lanes", "bus/signals"]);
    expect(assetsToUnload(["port/monolith", "memory/banks"], plan(1, 0, 0))).toEqual(["memory/banks", "port/monolith"]);
  });

  it("without a current chapter (spine not running) nothing loads and nothing unloads", () => {
    const p = plan(-1);
    expect(p).toEqual({ wanted: [], retained: null });
    expect(assetsToUnload(["port/monolith"], p)).toEqual([]);
  });

  it("defaults: preload 1 ahead, keep 1 either side", () => {
    expect(assetLoadingTuning).toEqual({ ahead: 1, keep: 1 });
  });
});
