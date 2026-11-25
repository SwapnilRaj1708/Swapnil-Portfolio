/**
 * Quality tiers (STANDARDS.md §2) and the pure rules that choose them. No browser access here:
 * every function takes its signals as input, so each rule is unit-tested (tiers.test.ts).
 */

export const RENDER_TIERS = ["high", "medium", "low"] as const;
export type RenderTier = (typeof RENDER_TIERS)[number];
export type Tier = RenderTier | "static";

/** Per-tier limits from STANDARDS.md §3. */
export const TIER_LIMITS: Record<RenderTier, { pixelRatio: number; frameTimeP95Ms: number }> = {
  high: { pixelRatio: 2, frameTimeP95Ms: 16.7 },
  medium: { pixelRatio: 1.5, frameTimeP95Ms: 20 },
  low: { pixelRatio: 1, frameTimeP95Ms: 33 },
};

/** What the start tier is chosen from (read once in the browser, src/lib/journey/signals.ts). */
export type CapabilitySignals = {
  /** The primary pointer is coarse (a touch screen): phones and tablets. */
  coarsePointer: boolean;
  /** The screen's shorter side in CSS px, when known. */
  screenShortSide: number | null;
  /** `navigator.deviceMemory` in GB (Chromium only; capped at 8). */
  deviceMemory: number | null;
  /** `navigator.hardwareConcurrency` (logical cores). */
  hardwareConcurrency: number | null;
};

/** A touch screen whose shorter side is below this is a phone (→ low); above it, a tablet. */
export const PHONE_MAX_SHORT_SIDE = 600;

/**
 * The start tier from capability checks, with the reason. WebGL 2 on a hardware renderer is
 * assumed (no WebGL 2 and a software renderer are static triggers, decided before this runs).
 *   - phone (coarse pointer, short side < 600 px) → low (STANDARDS §2: most phones);
 *   - tablet (coarse pointer) → medium;
 *   - ≤ 4 GB memory or ≤ 4 logical cores → medium (weaker laptops);
 *   - otherwise → high. Measured frame time then lowers it if needed.
 */
export function chooseStartTier(s: CapabilitySignals): { tier: RenderTier; reason: string } {
  if (s.coarsePointer && (s.screenShortSide ?? 0) < PHONE_MAX_SHORT_SIDE) return { tier: "low", reason: "phone" };
  if (s.coarsePointer) return { tier: "medium", reason: "tablet" };
  if (s.deviceMemory !== null && s.deviceMemory <= 4) return { tier: "medium", reason: `${s.deviceMemory} GB memory` };
  if (s.hardwareConcurrency !== null && s.hardwareConcurrency <= 4) {
    return { tier: "medium", reason: `${s.hardwareConcurrency} cores` };
  }
  return { tier: "high", reason: "capable device" };
}

/**
 * Renderer strings of software rasterisers (the unmasked WebGL renderer, case-insensitive):
 * Chrome's SwiftShader, Mesa's llvmpipe and softpipe, Windows' WARP ("Microsoft Basic Render
 * Driver"), and any renderer that calls itself "Software" (e.g. "Software Adapter", "Software
 * Rasterizer"). A context the browser refuses with `failIfMajorPerformanceCaveat` counts too
 * (signals.ts `probeWebGl2`): that is how a browser says the GPU is not used or is blocklisted.
 */
export const SOFTWARE_RENDERER_PATTERNS: readonly RegExp[] = [/swiftshader/i, /llvmpipe/i, /softpipe/i, /software/i, /basic render/i];

/** Is this WebGL renderer string a software one? Unknown (null) is not. */
export function isSoftwareRenderer(renderer: string | null): boolean {
  if (!renderer) return false;
  return SOFTWARE_RENDERER_PATTERNS.some((pattern) => pattern.test(renderer));
}

const RANK: Record<RenderTier, number> = { high: 2, medium: 1, low: 0 };

/** The lower of two tiers (a missing floor changes nothing). */
export function lowerOf(a: RenderTier, b: RenderTier | null): RenderTier {
  if (b === null) return a;
  return RANK[b] < RANK[a] ? b : a;
}

/** One step down; `low` is the lowest automatic tier, so it stays `low`. */
export function stepDown(tier: RenderTier): RenderTier {
  return tier === "high" ? "medium" : "low";
}

export function isRenderTier(value: unknown): value is RenderTier {
  return typeof value === "string" && (RENDER_TIERS as readonly string[]).includes(value);
}

export function isTier(value: unknown): value is Tier {
  return value === "static" || isRenderTier(value);
}

/**
 * `?tier=high|medium|low|static` from a URL query, honoured only where the build allows it (never
 * on the production deployment – src/config/journey.ts). Anything else is ignored.
 */
export function parseTierOverride(search: string, allowed: boolean): Tier | null {
  if (!allowed) return null;
  const value = new URLSearchParams(search).get("tier");
  return isTier(value) ? value : null;
}

/**
 * The GPU the canvas asks for (WebGL `powerPreference`). Visitors get "high-performance": on a
 * dual-GPU machine the browser may then use the discrete GPU. `?gpu=low-power` (testing, review
 * captures, the numbers script; honoured only where the `?tier=` override is allowed) asks for
 * the integrated, low-power GPU instead – the reference laptop is measured on it (D-40).
 */
export type GpuPreference = "high-performance" | "low-power";

export const VISITOR_GPU_PREFERENCE: GpuPreference = "high-performance";

export function chooseGpuPreference(search: string, allowed: boolean): GpuPreference {
  if (!allowed) return VISITOR_GPU_PREFERENCE;
  return new URLSearchParams(search).get("gpu") === "low-power" ? "low-power" : VISITOR_GPU_PREFERENCE;
}

/** Why the visitor gets the static tier. */
export type StaticReason =
  | "override"
  | "simple-view"
  | "reduced-motion"
  | "save-data"
  | "context-lost"
  | "chunk-failed"
  | "low-failed"
  | "no-webgl2"
  | "software-renderer";

/** The cheap, synchronous static triggers – checked before anything is downloaded. */
export type StaticSignals = {
  /** The visitor turned "simple view" on (remembered in localStorage). */
  simpleView: boolean;
  /** `prefers-reduced-motion: reduce`. */
  reducedMotion: boolean;
  /** `navigator.connection.saveData` (data saver). */
  saveData: boolean;
  /** The graphics context was lost twice in this session (remembered in sessionStorage). */
  contextLostTwice: boolean;
  /** The 3D chunk failed to load in this page's lifetime. */
  chunkFailed: boolean;
  /** The frame time failed even at `low` in this session (remembered in sessionStorage). */
  lowFailed: boolean;
};

/**
 * The first cheap static trigger that applies, or null. WebGL 2 and the software renderer are not
 * part of this: probing them creates a context, so they run only when every cheap check passed.
 */
export function findStaticReason(s: StaticSignals): StaticReason | null {
  if (s.simpleView) return "simple-view";
  if (s.reducedMotion) return "reduced-motion";
  if (s.saveData) return "save-data";
  if (s.contextLostTwice) return "context-lost";
  if (s.chunkFailed) return "chunk-failed";
  if (s.lowFailed) return "low-failed";
  return null;
}

export function staticReasonForWebGl2(webgl2: boolean): StaticReason | null {
  return webgl2 ? null : "no-webgl2";
}

/** What the WebGL probe found (signals.ts `probeWebGl2`). */
export type ProbeResult = { webgl2: boolean; softwareRenderer: boolean };

export type TierDecision =
  | { tier: "static"; reason: StaticReason; forced: boolean }
  | { tier: RenderTier; reason: string; forced: boolean };

/**
 * The whole decision, in order (journey-layer.tsx runs it after hydration, and again when simple
 * view or reduced motion change):
 *
 *   1. `?tier=static` → static.
 *   2. The cheap triggers: simple view, reduced motion, data saver, context lost twice, the chunk
 *      failed, frame time failed at low. A forced render tier (`?tier=high|medium|low`) bypasses
 *      only the last one, so tests and captures can run the canvas on any machine.
 *   3. The WebGL probe – lazy, so no context is created when step 2 already decided. No WebGL 2
 *      → static, forced tier or not: there is nothing to render with.
 *   4. A forced render tier → that tier, pinned (no downgrade, no low-tier failure, no floor).
 *   5. A software renderer → static.
 *   6. The start tier from the capabilities (the store then applies the session's floor).
 */
export function decideTier(input: {
  override: Tier | null;
  staticSignals: StaticSignals;
  probe: () => ProbeResult;
  capabilities: () => CapabilitySignals;
}): TierDecision {
  const { override } = input;
  if (override === "static") return { tier: "static", reason: "override", forced: true };
  const forced = override !== null;
  const cheap = findStaticReason({ ...input.staticSignals, lowFailed: input.staticSignals.lowFailed && !forced });
  if (cheap) return { tier: "static", reason: cheap, forced: false };
  const probe = input.probe();
  const noWebGl2 = staticReasonForWebGl2(probe.webgl2);
  if (noWebGl2) return { tier: "static", reason: noWebGl2, forced: false };
  if (override) return { tier: override, reason: "override", forced: true };
  if (probe.softwareRenderer) return { tier: "static", reason: "software-renderer", forced: false };
  return { ...chooseStartTier(input.capabilities()), forced: false };
}
