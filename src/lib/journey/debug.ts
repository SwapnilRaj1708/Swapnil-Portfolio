import type { JourneyState, LoadingState } from "./store";

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

/** The scroll spine's state (PF-008): store values plus what they were computed from. */
export type ScrollDebug = {
  /** The registry's chapter ids, in order (the boundaries follow it). */
  chapters: string[];
  active: boolean;
  mode: string | null;
  /** The camera eases toward the scroll position (no Lenis). */
  damped: boolean;
  progress: number;
  chapter: string | null;
  chapterIndex: number;
  chapterProgress: number;
  epoch: number;
  /** Each chapter's start (scroll px), from the measured sections. */
  boundaries: number[];
  /** The largest scroll position (px). */
  max: number;
  scrollY: number;
  /** Section tops (document px) and the scroll padding the boundaries were measured with. */
  sectionTops: number[];
  scrollPadding: number;
  /** The nav jump in flight (PF-009 follow-up 1), or null. */
  jump: JumpDebug | null;
  /** The last nav jump that ended, or null. */
  lastJump: JumpDebug | null;
};

/** A nav jump: where it goes and what happened on the way. */
export type JumpDebug = {
  chapter: string;
  /** The chapter start it is (or was last) heading for (scroll px). */
  target: number;
  /** Times it was sent on again: a layout change, a refresh, a stalled smooth scroll. */
  retargets: number;
  /** A refresh was requested while it ran and held back until it landed. */
  refreshDeferred: boolean;
  /** How it ended: at the target ("landed", focus moved), instantly after too many re-targets or
   *  the time limit ("forced", focus moved), or taken over by the visitor's own scrolling
   *  ("abandoned", focus not moved). Null while in flight. */
  outcome: "landed" | "forced" | "abandoned" | null;
  /** scrollY when focus moved to the section (null if it did not). */
  focusedAt: number | null;
};

/** The camera rig (PF-008): the path it plays and where the camera is. */
export type RigDebug = {
  ready: boolean;
  fps: number;
  firstFrame: number;
  lastFrame: number;
  /** Start frame of each chapter (from the markers, or even spacing). */
  starts: number[];
  problem: string | null;
  clipStart: number;
  /** The frame the camera shows now, and the one it heads for (equal unless easing). */
  frame: number;
  targetFrame: number;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  fov: number;
};

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
  /** React renders per journey component (PF-008: unchanged while the page scrolls). */
  renders: Record<string, number>;
  /** The scroll spine (null while it is not running). */
  scroll: (() => ScrollDebug) | null;
  /** Sets a chapter's extra scroll length (viewport heights) as the dev panel does (tests). */
  setExtraScroll: ((chapter: string, viewportHeights: number) => void) | null;
  /** Asks the spine for a refresh (tests, PF-009 follow-up 1): "request" goes the spine's own way
   *  (held back while a nav jump runs), "force" runs `ScrollTrigger.refresh()` at once, as a refresh
   *  from outside the spine would. */
  refreshScroll: ((how: "request" | "force") => void) | null;
  /** The camera rig (null until the canvas has mounted it). */
  rig: (() => RigDebug) | null;
  /** Per-chapter assets (PF-009): what is loaded, what the chapter rules want, the loading progress. */
  assets: (() => AssetsDebug) | null;
};

export type AssetsDebug = { loaded: string[]; wanted: string[]; loading: LoadingState };

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
    renders: {},
    scroll: null,
    setExtraScroll: null,
    refreshScroll: null,
    rig: null,
    assets: null,
  };
  return window.__journey;
}

/**
 * Counts a React render of a journey component (tests: the scene must not re-render through React
 * while the page scrolls). Called in render; a no-op where the hooks are not built in.
 */
export function countRender(name: string): void {
  const debug = journeyDebug();
  if (debug) debug.renders[name] = (debug.renders[name] ?? 0) + 1;
}
