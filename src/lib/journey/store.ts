import { createStore } from "zustand/vanilla";
import { getTierFloor, setLowFailed, setTierFloor } from "./session";
import { stepDown, type RenderTier, type StaticReason, type Tier } from "./tiers";

/**
 * The one tier store (STANDARDS.md §2). Vanilla zustand: the frame loop reads it with
 * `journeyStore.getState()` and never causes a React render; components subscribe with
 * `useStore(journeyStore, selector)`.
 *
 *   pending → the cheap checks have not run yet (server render, hydration);
 *   static  → no canvas; the static home (one of the static triggers, with its reason);
 *   high / medium / low → the canvas, at that tier.
 *
 * A render tier only ever moves down within a visit: `lower()` drops one step and stores the
 * floor in sessionStorage; `enter()` never starts above that floor. Below `low` there is only
 * `static`: `failAtLow()` ends the canvas for the session.
 */

export type TierChange = { tier: Tier; reason: string; atMs: number };

export type JourneyState = {
  tier: Tier | "pending";
  reason: string;
  /** Set by the `?tier=` override: the tier is pinned (no capability choice, no downgrade). */
  forced: boolean;
  /** Every change, for the debug hooks and the numbers script. */
  history: TierChange[];
};

const initial: JourneyState = { tier: "pending", reason: "not decided yet", forced: false, history: [] };

export const journeyStore = createStore<JourneyState>()(() => initial);

function now(): number {
  return typeof performance === "undefined" ? 0 : performance.now();
}

function set(tier: Tier, reason: string, forced: boolean): void {
  const state = journeyStore.getState();
  if (state.tier === tier && state.reason === reason && state.forced === forced) return;
  journeyStore.setState({ tier, reason, forced, history: [...state.history, { tier, reason, atMs: now() }] });
}

/** Static tier, with the trigger that caused it. */
export function goStatic(reason: StaticReason): void {
  set("static", reason, reason === "override");
}

/**
 * Enters the render tiers: the start tier (capability choice or override), never above the
 * session's floor unless forced by the override.
 */
export function enterRenderTier(start: RenderTier, reason: string, forced: boolean): RenderTier {
  const floor = forced ? null : getTierFloor();
  const tier = floor !== null && stepRank(floor) < stepRank(start) ? floor : start;
  set(tier, tier === start ? reason : `session floor (${reason} → ${tier})`, forced);
  return tier;
}

/**
 * Drops one tier because the measured frame time demands it (frame-monitor.ts). `low` stays
 * `low`; a forced tier is never changed. Returns the tier now in force.
 */
export function lowerTier(): Tier | "pending" {
  const state = journeyStore.getState();
  if (state.forced || state.tier === "pending" || state.tier === "static" || state.tier === "low") return state.tier;
  const next = stepDown(state.tier);
  setTierFloor(next);
  set(next, "frame time", false);
  return next;
}

/**
 * The frame time stayed over `low`'s limit for the low-tier sustain time (frame-loop.ts): there is
 * no lower render tier, so the session goes static for good (sessionStorage `journey-low-failed`).
 * Only from an automatic `low`: a forced tier (`?tier=`) is never changed. Returns the tier now in
 * force.
 */
export function failAtLow(): Tier | "pending" {
  const state = journeyStore.getState();
  if (state.forced || state.tier !== "low") return state.tier;
  setLowFailed();
  goStatic("low-failed");
  return "static";
}

function stepRank(tier: RenderTier): number {
  return tier === "high" ? 2 : tier === "medium" ? 1 : 0;
}

/** For unit tests. */
export function resetJourneyStoreForTests(): void {
  journeyStore.setState(initial, true);
}

/**
 * Where the canvas can be seen: elements that let it show through (today only the hero, marked by
 * the tier backdrop) and whether the page is visible at all. The frame loop renders only while
 * the page is visible AND at least one window intersects the viewport (STANDARDS.md §4: no frames
 * while hidden or fully covered).
 */
export type ViewState = {
  /** See-through sections on the page (mounted), in view or not: the 3D chunk loads only once
   *  there is one, so pages without one (/work, /resume …) never download it. */
  mounted: number;
  /** See-through sections intersecting the viewport. */
  windows: number;
  pageVisible: boolean;
};

export const viewStore = createStore<ViewState>()(() => ({ mounted: 0, windows: 0, pageVisible: true }));

export function changeMountedWindows(delta: 1 | -1): void {
  viewStore.setState((s) => ({ mounted: Math.max(0, s.mounted + delta) }));
}

export function canvasSeen(state: ViewState = viewStore.getState()): boolean {
  return state.pageVisible && state.windows > 0;
}

export function changeVisibleWindows(delta: 1 | -1): void {
  viewStore.setState((s) => ({ windows: Math.max(0, s.windows + delta) }));
}

export function setPageVisible(visible: boolean): void {
  if (viewStore.getState().pageVisible !== visible) viewStore.setState({ pageVisible: visible });
}
