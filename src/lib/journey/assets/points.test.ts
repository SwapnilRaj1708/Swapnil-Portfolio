import { beforeEach, describe, expect, it } from "vitest";
import { addAssetBytes, beginAssetLoad, endAssetLoad, forgetAsset, loadingFraction, loadingStore, resetLoadingStoreForTests } from "../store";
import { findHotspot, listPoints, registerAssetPoints, resetPointsForTests, unregisterAssetPoints } from "./points";

beforeEach(() => {
  resetPointsForTests();
  resetLoadingStoreForTests();
});

describe("anchor, hotspot and glow registries", () => {
  it("register per asset, list by kind, clear on unload", () => {
    registerAssetPoints("bus/lanes", [
      { asset: "bus/lanes", kind: "hotspot", name: "HOTSPOT_slot_02", position: [1, 2, 3] },
      { asset: "bus/lanes", kind: "hotspot", name: "HOTSPOT_slot_01", position: [0, 1, 0] },
      { asset: "bus/lanes", kind: "anchor", name: "ANCHOR_bus", position: [0, 0, -40] },
      { asset: "bus/lanes", kind: "glow", name: "GLOW_lane_01", position: [2, 0, -40] },
    ]);
    registerAssetPoints("port/monolith", [{ asset: "port/monolith", kind: "anchor", name: "ANCHOR_port", position: [0, 0, 0] }]);
    expect(listPoints("hotspot").map((p) => p.name)).toEqual(["HOTSPOT_slot_01", "HOTSPOT_slot_02"]);
    expect(listPoints("anchor").map((p) => p.name)).toEqual(["ANCHOR_bus", "ANCHOR_port"]);
    expect(listPoints("glow").map((p) => p.position)).toEqual([[2, 0, -40]]);
    expect(findHotspot("HOTSPOT_slot_02")?.position).toEqual([1, 2, 3]);
    unregisterAssetPoints("bus/lanes");
    expect(listPoints("hotspot")).toEqual([]);
    expect(listPoints("anchor").map((p) => p.name)).toEqual(["ANCHOR_port"]);
  });
});

describe("loading progress (the journey store's loading signal, for PF-012)", () => {
  it("sums bytes per asset and overall; a finished asset's total is what arrived", () => {
    expect(loadingFraction()).toBe(1); // nothing wanted
    beginAssetLoad("port/monolith", 1000);
    beginAssetLoad("bus/lanes", 3000);
    expect(loadingStore.getState()).toMatchObject({ loaded: 0, total: 4000 });
    addAssetBytes("port/monolith", 600);
    addAssetBytes("bus/lanes", 1000);
    expect(loadingFraction()).toBeCloseTo(0.4);
    addAssetBytes("port/monolith", 400);
    endAssetLoad("port/monolith", true);
    expect(loadingStore.getState().assets["port/monolith"]).toEqual({ loaded: 1000, total: 1000, state: "loaded" });
    forgetAsset("bus/lanes");
    expect(loadingStore.getState()).toMatchObject({ loaded: 1000, total: 1000 });
    expect(loadingFraction()).toBe(1);
  });

  it("a failed asset keeps its numbers and says so; bytes for an unknown key are ignored", () => {
    beginAssetLoad("core/die", 500);
    addAssetBytes("core/die", 100);
    endAssetLoad("core/die", false);
    expect(loadingStore.getState().assets["core/die"]).toEqual({ loaded: 100, total: 500, state: "failed" });
    addAssetBytes("nope", 50);
    expect(loadingStore.getState().loaded).toBe(100);
  });
});
