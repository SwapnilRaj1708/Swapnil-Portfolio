import { getSimpleView } from "@/lib/simple-view";
import { CONTEXT_LOSSES_BEFORE_STATIC, getContextLosses, getLowFailed } from "./session";
import { isSoftwareRenderer, type CapabilitySignals, type GpuPreference, type StaticSignals } from "./tiers";

/**
 * Reads the signals the tier rules (tiers.ts) take, from the browser. Each read is guarded: a
 * missing API (older browsers, in-app browsers) reads as "no signal", never as an error.
 */

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type ConnectionLike = { saveData?: boolean };
type NavigatorLike = Navigator & { connection?: ConnectionLike; deviceMemory?: number };

function matches(query: string): boolean {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return matches(REDUCED_MOTION_QUERY);
}

export function saveDataOn(): boolean {
  try {
    return (navigator as NavigatorLike).connection?.saveData === true;
  } catch {
    return false;
  }
}

/** The cheap static triggers (no download, no graphics context). */
export function readStaticSignals(chunkFailed: boolean): StaticSignals {
  return {
    simpleView: getSimpleView(),
    reducedMotion: prefersReducedMotion(),
    saveData: saveDataOn(),
    contextLostTwice: getContextLosses() >= CONTEXT_LOSSES_BEFORE_STATIC,
    chunkFailed,
    lowFailed: getLowFailed(),
  };
}

export type WebGl2Probe = {
  webgl2: boolean;
  /** Unmasked renderer string where the browser exposes it, else the masked one. */
  renderer: string | null;
  /** A software rasteriser (tiers.ts `isSoftwareRenderer`), or a context refused with
   *  `failIfMajorPerformanceCaveat` but given without it. */
  softwareRenderer: boolean;
};

/**
 * Probes WebGL 2 on a throwaway canvas: is there a context at all, is it software, what renderer.
 * It asks for the GPU the canvas will ask for (`powerPreference`), so the renderer it reads is the
 * canvas's. Two attempts: with `failIfMajorPerformanceCaveat` (the WebGL context attribute the
 * browser answers with null on a software renderer or a blocklisted GPU), then without. The
 * context is released at once (browsers cap live contexts).
 */
export function probeWebGl2(powerPreference: GpuPreference, doc: Document = document): WebGl2Probe {
  const attempt = (caveat: boolean): WebGL2RenderingContext | null => {
    try {
      const canvas = doc.createElement("canvas");
      return canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: caveat, powerPreference }) as WebGL2RenderingContext | null;
    } catch {
      return null;
    }
  };
  const fast = attempt(true);
  const gl = fast ?? attempt(false);
  if (!gl) return { webgl2: false, renderer: null, softwareRenderer: false };
  let renderer: string | null = null;
  try {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  } catch {
    renderer = null;
  }
  try {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // Released by garbage collection instead.
  }
  return { webgl2: true, renderer, softwareRenderer: !fast || isSoftwareRenderer(renderer) };
}

/** The capability signals for the start tier (tiers.ts `chooseStartTier`). */
export function readCapabilitySignals(): CapabilitySignals {
  const nav = navigator as NavigatorLike;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  let shortSide: number | null = null;
  try {
    shortSide = num(Math.min(window.screen.width, window.screen.height));
  } catch {
    shortSide = null;
  }
  return {
    coarsePointer: matches("(pointer: coarse)"),
    screenShortSide: shortSide,
    deviceMemory: num(nav.deviceMemory),
    hardwareConcurrency: num(nav.hardwareConcurrency),
  };
}
