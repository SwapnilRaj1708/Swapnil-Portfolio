import { parseSmoothOverride } from "./scroll-mode";
import { getStoredOverrides, setStoredOverrides } from "./session";
import { chooseGpuPreference, isTier, parseTierOverride, VISITOR_GPU_PREFERENCE, type GpuPreference, type Tier } from "./tiers";

/**
 * The testing overrides of a visit: `?tier=` (tiers.ts), `?gpu=low-power` (tiers.ts) and
 * `?smooth=off` (scroll-mode.ts). Honoured only where the build allows them – never on the
 * production deployment (src/config/journey.ts: `JOURNEY_TIER_OVERRIDE`).
 *
 * They are read ONCE per page load, from the address the document was loaded with – not from
 * `location` at the moment some code asks. The tier loader runs in a lazy chunk after hydration,
 * so by then a client navigation (a header link from `/work?tier=high` to `/#about`) may already
 * have replaced the address with one that has no query; the loader would then see no override and
 * decide as for a visitor (a software renderer → static). The navigation timing entry keeps the
 * document's own address whatever `history.pushState` did since.
 *
 * And they are kept for the session (sessionStorage `journey-overrides`, try/catch): a later page
 * load in the same tab without any override in its address (a reload of `/#about`, an address
 * typed in) keeps them. A load whose address names at least one override replaces the whole set
 * with what that address says, so `?tier=high` after `?tier=low&gpu=low-power` is exactly
 * `?tier=high`. A new tab starts without overrides.
 *
 * Nothing here bypasses a rule: the forced tier still never overrides "no WebGL 2" or the other
 * static triggers (tiers.ts `decideTier`).
 */

export type JourneyOverrides = {
  /** `?tier=high|medium|low|static`, or null. */
  tier: Tier | null;
  /** The GPU the canvas asks for: `"low-power"` with `?gpu=low-power`, else the visitor's. */
  gpu: GpuPreference;
  /** `?smooth=off`, or null. */
  smooth: "off" | null;
};

export const NO_OVERRIDES: JourneyOverrides = Object.freeze({ tier: null, gpu: VISITOR_GPU_PREFERENCE, smooth: null });

function namesAny(o: JourneyOverrides): boolean {
  return o.tier !== null || o.gpu !== VISITOR_GPU_PREFERENCE || o.smooth !== null;
}

/** The overrides an address's query names, or null when it names none (or they are not allowed). */
export function parseOverrides(search: string, allowed: boolean): JourneyOverrides | null {
  if (!allowed) return null;
  const parsed: JourneyOverrides = {
    tier: parseTierOverride(search, allowed),
    gpu: chooseGpuPreference(search, allowed),
    smooth: parseSmoothOverride(search, allowed),
  };
  return namesAny(parsed) ? parsed : null;
}

/** A stored set, validated field by field (anything unexpected → null: no overrides). */
export function parseStoredOverrides(value: string | null): JourneyOverrides | null {
  if (!value) return null;
  try {
    const raw: unknown = JSON.parse(value);
    if (typeof raw !== "object" || raw === null) return null;
    const fields = raw as Record<string, unknown>;
    const tier = fields.tier === null ? null : isTier(fields.tier) ? fields.tier : undefined;
    const gpu = fields.gpu === "low-power" || fields.gpu === "high-performance" ? fields.gpu : undefined;
    const smooth = fields.smooth === null ? null : fields.smooth === "off" ? "off" : undefined;
    if (tier === undefined || gpu === undefined || smooth === undefined) return null;
    const stored: JourneyOverrides = { tier, gpu, smooth };
    return namesAny(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * The rule above, pure: the overrides for this page load, and the value to store (null: leave
 * the stored value alone).
 */
export function resolveOverrides(input: { documentSearch: string; allowed: boolean; stored: string | null }): {
  overrides: JourneyOverrides;
  store: string | null;
} {
  if (!input.allowed) return { overrides: NO_OVERRIDES, store: null };
  const named = parseOverrides(input.documentSearch, true);
  if (named) return { overrides: named, store: JSON.stringify(named) };
  return { overrides: parseStoredOverrides(input.stored) ?? NO_OVERRIDES, store: null };
}

/**
 * The query of the address this document was loaded with: the navigation timing entry (unchanged
 * by client navigations), else – where a browser has none – the current address.
 */
export function documentLoadSearch(): string {
  try {
    const entry = performance.getEntriesByType?.("navigation")[0];
    if (entry?.name) return new URL(entry.name).search;
  } catch {
    // No navigation timing (or an unparsable address): fall back to the current address.
  }
  return window.location.search;
}

/** Decided once per page load (module state survives client navigations, not reloads). */
let resolved: JourneyOverrides | null = null;

/** This page load's testing overrides (browser only). */
export function journeyOverrides(): JourneyOverrides {
  if (resolved) return resolved;
  const allowed = process.env.JOURNEY_TIER_OVERRIDE === "on";
  // On the production deployment nothing is read or written: the stored value is never consulted.
  const { overrides, store } = resolveOverrides({
    documentSearch: allowed ? documentLoadSearch() : "",
    allowed,
    stored: allowed ? getStoredOverrides() : null,
  });
  if (store !== null) setStoredOverrides(store);
  resolved = overrides;
  return overrides;
}

/** For unit tests: forget this page load's decision (as a new page load would). */
export function resetOverridesForTests(): void {
  resolved = null;
}
