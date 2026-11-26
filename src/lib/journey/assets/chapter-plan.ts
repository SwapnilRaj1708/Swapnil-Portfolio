import type { AssetManifestEntry } from "./manifest-types";

/**
 * Per-chapter loading (STANDARDS.md §1: only the current chapter and its neighbours are mounted;
 * the next one's assets preload; a leaving chapter disposes everything it created).
 *
 *   - the current chapter's assets load first, then the next `ahead` chapters' (preload);
 *   - a chapter more than `keep` chapters behind or ahead of the current one is unloaded;
 *   - a chapter just behind (within `keep`) stays loaded if it is loaded, but is not fetched
 *     again for it: scrolling back reuses it, a deep link does not pull in the chapter before.
 *
 * Pure: the registry is built from the manifest (assets whose chapter is a scroll chapter; `shared`
 * assets are not chapter-bound and load only when something asks for them – PF-010 wires the
 * real chapters). `assetLoadingTuning` is mutable on purpose: the dev panel writes into it.
 */
export const assetLoadingTuning = {
  /** Chapters ahead of the current one whose assets preload. */
  ahead: 1,
  /** Chapters behind or ahead of the current one that stay loaded; further ones are unloaded. */
  keep: 1,
};

/** The largest value the dev panel offers for either setting. */
export const MAX_ASSET_WINDOW = 5;

/** Asset keys per chapter, in the registry's chapter order. */
export function chapterAssetRegistry(manifest: readonly AssetManifestEntry[], chapterIds: readonly string[]): string[][] {
  return chapterIds.map((id) =>
    manifest
      .filter((entry) => entry.chapter === id)
      .map((entry) => entry.key)
      .sort(),
  );
}

export type ChapterAssetPlan = {
  /** Keys to have loaded, in priority order: the current chapter's first, then the preloads. */
  wanted: string[];
  /** Keys that may stay loaded; null = keep everything (no current chapter: nothing changes). */
  retained: Set<string> | null;
};

export function planChapterAssets(options: {
  registry: readonly (readonly string[])[];
  /** Index of the current chapter, or -1 when there is none (the spine is not running). */
  current: number;
  ahead: number;
  keep: number;
}): ChapterAssetPlan {
  const { registry, current } = options;
  const ahead = Math.max(0, Math.floor(options.ahead));
  const keep = Math.max(0, Math.floor(options.keep));
  if (current < 0 || current >= registry.length) return { wanted: [], retained: null };
  const wanted: string[] = [];
  for (let i = current; i <= Math.min(registry.length - 1, current + ahead); i++) {
    for (const key of registry[i]) if (!wanted.includes(key)) wanted.push(key);
  }
  const retained = new Set<string>(wanted);
  for (let i = Math.max(0, current - keep); i <= Math.min(registry.length - 1, current + keep); i++) {
    for (const key of registry[i]) retained.add(key);
  }
  return { wanted, retained };
}

/** Loaded (or loading) keys the plan no longer retains, in a stable order. */
export function assetsToUnload(loaded: Iterable<string>, plan: ChapterAssetPlan): string[] {
  if (!plan.retained) return [];
  const retained = plan.retained;
  return [...loaded].filter((key) => !retained.has(key)).sort();
}
