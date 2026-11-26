import type { Tier } from "../tiers";
import { ASSET_MANIFEST } from "./manifest.generated";
import type { AssetManifestEntry, AssetVariant } from "./manifest-types";

export { ASSET_MANIFEST };
export type { AssetManifestEntry, AssetVariant };

/**
 * Where the pipeline writes site assets and the site fetches them: `public/assets/<chapter>/<slug>/`
 * (the journey camera path keeps its own folder, `/assets/world/`).
 */
export const ASSET_BASE = "/assets/";

/** The URL of one variant of an asset. */
export function assetUrl(entry: AssetManifestEntry, variant: AssetVariant): string {
  return `${ASSET_BASE}${entry.chapter}/${entry.slug}/${entry.files[variant].file}`;
}

/**
 * Which file a tier loads (STANDARDS.md §2): high and medium load `-high`, low loads `-low`,
 * static (and the moment before the tier is known) loads nothing.
 */
export function variantForTier(tier: Tier | "pending"): AssetVariant | null {
  if (tier === "high" || tier === "medium") return "high";
  if (tier === "low") return "low";
  return null;
}

/** An asset by its key (`<chapter>/<slug>`). */
export function findAsset(key: string, manifest: readonly AssetManifestEntry[] = ASSET_MANIFEST): AssetManifestEntry | null {
  return manifest.find((entry) => entry.key === key) ?? null;
}
