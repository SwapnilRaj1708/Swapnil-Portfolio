import type { JourneyState } from "./store";

/**
 * `window.__journey`: hooks for the browser tests, the review captures and the numbers script.
 * Installed only where the `?tier=` override is allowed (never on the production deployment –
 * src/config/journey.ts), and only by the journey's own code. Plain fields are written in the
 * frame loop (no allocation); functions are filled in by the scene when it mounts.
 */

export type SceneStats = {
  tier: string;
  pixelRatio: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  /** Estimated GPU memory of every texture the scene uses (width × height × bytes per pixel, plus mipmaps). */
  textureBytes: number;
  programs: number;
  /** The canvas context's unmasked WebGL renderer (which GPU it actually got), or null. */
  renderer: string | null;
  /** The `powerPreference` the canvas context was created with (its context attributes). */
  powerPreference: string | null;
};

export type FrameSample = {
  frames: number;
  durationMs: number;
  /** Intervals between animation frames (ms). */
  intervalP50: number;
  intervalP95: number;
  intervalP99: number;
  /** CPU time of the frame's work: updates + the render call (ms). */
  cpuP50: number;
  cpuP95: number;
  cpuP99: number;
};

export type ScreenRect = { left: number; top: number; right: number; bottom: number };

export type JourneyDebug = {
  /** Frames rendered since the canvas was created (written in the frame loop). */
  frames: number;
  /** The first frame has been drawn. */
  ready: boolean;
  /** Busy-waits this many ms in every frame (tests: simulates a slow GPU/CPU to force a downgrade). */
  loadMs: number;
  /** When > 0, the downgrade monitor sees this frame interval (ms) instead of the measured one
   *  (tests: simulates slow frames without slowing the machine). 0 = off. */
  simulatedFrameMs: number;
  /** The tier store's state. */
  state: () => JourneyState;
  /** Scene numbers right now (null while there is no canvas). */
  stats: (() => SceneStats) | null;
  /** Samples frame intervals and CPU times for `durationMs` (the numbers script). */
  sample: ((durationMs: number) => Promise<FrameSample>) | null;
  /** The test object's bounds on screen in CSS px (conservative: its bounding sphere). */
  objectRect: (() => ScreenRect | null) | null;
  /** After the canvas was unmounted: what the renderer still held, read after disposal. */
  lastRelease: { geometries: number; textures: number; programs: number; programNames: string[]; contextLost: boolean } | null;
  /** The last p95 frame interval the downgrade monitor computed (ms), -1 before the first. */
  monitorP95: number;
};

declare global {
  interface Window {
    __journey?: JourneyDebug;
  }
}

/** The hooks object, or null where the build does not allow them. */
export function journeyDebug(): JourneyDebug | null {
  if (process.env.JOURNEY_TIER_OVERRIDE !== "on" || typeof window === "undefined") return null;
  return window.__journey ?? null;
}

export function installJourneyDebug(state: () => JourneyState): JourneyDebug | null {
  if (process.env.JOURNEY_TIER_OVERRIDE !== "on" || typeof window === "undefined") return null;
  window.__journey ??= {
    frames: 0,
    ready: false,
    loadMs: 0,
    simulatedFrameMs: 0,
    state,
    stats: null,
    sample: null,
    objectRect: null,
    lastRelease: null,
    monitorP95: -1,
  };
  return window.__journey;
}
