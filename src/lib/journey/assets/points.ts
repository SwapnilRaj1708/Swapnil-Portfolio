import { createStore } from "zustand/vanilla";

/**
 * The anchor, hotspot and glow-accent registries (STANDARDS.md §6): world positions of the
 * `ANCHOR_<chapter>`, `HOTSPOT_<name>` and `GLOW_<name>` empties of every loaded asset, so later
 * items can attach DOM content to a hotspot (`HOTSPOT_slot_03`), place a chapter by its anchor, or
 * put a runtime light accent at a glow position (none is created yet). Plain numbers, no three.js:
 * DOM code may read it without pulling the 3D chunk in. Written when an asset loads, cleared when
 * it unloads; vanilla zustand, so DOM components can subscribe.
 */

export type PointKind = "anchor" | "hotspot" | "glow";

export type AssetPoint = {
  /** The asset it came from (`<chapter>/<slug>`). */
  asset: string;
  kind: PointKind;
  /** The empty's name (`HOTSPOT_slot_01`). */
  name: string;
  /** World position (m, +Y up). */
  position: readonly [number, number, number];
};

export type PointsState = { byAsset: Record<string, readonly AssetPoint[]> };

export const pointsStore = createStore<PointsState>()(() => ({ byAsset: {} }));

export function registerAssetPoints(asset: string, points: readonly AssetPoint[]): void {
  pointsStore.setState((s) => ({ byAsset: { ...s.byAsset, [asset]: points } }));
}

export function unregisterAssetPoints(asset: string): void {
  const { [asset]: gone, ...rest } = pointsStore.getState().byAsset;
  if (gone) pointsStore.setState({ byAsset: rest });
}

/** Every registered point of a kind, in asset then name order. */
export function listPoints(kind: PointKind, state: PointsState = pointsStore.getState()): AssetPoint[] {
  return Object.keys(state.byAsset)
    .sort()
    .flatMap((asset) => state.byAsset[asset].filter((p) => p.kind === kind))
    .sort((a, b) => (a.asset === b.asset ? a.name.localeCompare(b.name) : 0));
}

/** One hotspot by name (`HOTSPOT_slot_01`), from any loaded asset. */
export function findHotspot(name: string, state: PointsState = pointsStore.getState()): AssetPoint | null {
  return listPoints("hotspot", state).find((p) => p.name === name) ?? null;
}

/** For unit tests. */
export function resetPointsForTests(): void {
  pointsStore.setState({ byAsset: {} }, true);
}
