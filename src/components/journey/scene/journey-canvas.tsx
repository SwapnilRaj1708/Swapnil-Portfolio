"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { NeutralToneMapping, type WebGLRenderer } from "three";
import { journeyDebug } from "@/lib/journey/debug";
import { addContextLoss, CONTEXT_LOSSES_BEFORE_STATIC } from "@/lib/journey/session";
import { canvasSeen, failAtLow, goStatic, journeyStore, lowerTier, viewStore } from "@/lib/journey/store";
import { TIER_LIMITS, type GpuPreference, type RenderTier } from "@/lib/journey/tiers";
import { PALETTE } from "@/styles/palette";
import { FrameEvent, FrameLoop } from "./frame-loop";
import { readSceneStats } from "./stats";
import { TestObject } from "./test-object";

/**
 * The lazy 3D chunk's entry (three + React Three Fiber + the scene). Imported only by the loader
 * (../journey-layer.tsx) after the page is interactive; never part of a route's first-load JS.
 *
 * Renderer (STANDARDS.md §4, D-14, D-29): WebGL 2 through three's WebGLRenderer, sRGB output,
 * three's NeutralToneMapping (Khronos PBR Neutral – provisional until PF-011), no shadows. The
 * pixel ratio is capped per tier (STANDARDS §3). `powerPreference` comes from the loader:
 * "high-performance" for visitors, "low-power" with `?gpu=low-power` (tests, captures and the
 * numbers script, off production only – the reference laptop is measured on its integrated GPU,
 * D-40). tiers.ts `chooseGpuPreference`.
 */

export type JourneyCanvasProps = {
  tier: RenderTier;
  /** WebGL `powerPreference` for the context (fixed when it is created). */
  powerPreference: GpuPreference;
  /** Called once, after the first frame is drawn. */
  onFirstFrame: () => void;
  /** Called when the canvas unmounts (simple view, a static trigger). */
  onRelease: () => void;
};

// Dev-only tuning panel and performance overlay (STANDARDS §5): `process.env.JOURNEY_DEV_TOOLS` is
// inlined at build (src/config/journey.ts) – "on" only in `next dev` and ENABLE_DEV_PAGES=1
// builds. Elsewhere this branch is dead code and leva / r3f-perf are not in any chunk.
// Shown at once under `next dev`; in an ENABLE_DEV_PAGES=1 build only with `?tune` in the URL, so
// tests, captures and frame-time numbers taken on such a build are not covered or slowed by them.
// DevTools (inside the R3F tree: the overlay needs the renderer) and DevPanel (the leva panel, in
// the DOM tree: portalled to <body>, placed below the header) come from the same module.
let DevTools: ComponentType | null = null;
let DevPanel: ComponentType | null = null;
if (process.env.JOURNEY_DEV_TOOLS === "on") {
  DevTools = lazy(() => import("./dev-tools").then((m) => ({ default: m.DevTools })));
  DevPanel = lazy(() => import("./dev-tools").then((m) => ({ default: m.DevPanel })));
}

function wantsDevTools(): boolean {
  if (!DevTools) return false;
  if (process.env.NODE_ENV === "development") return true;
  return new URLSearchParams(window.location.search).has("tune");
}

/** How long a lost context may take to come back before the session goes static. */
const RESTORE_TIMEOUT_MS = 5000;

export function JourneyCanvas({ tier, powerPreference, onFirstFrame, onRelease }: JourneyCanvasProps) {
  // Antialiasing is fixed when the context is created: decided by the tier the canvas starts on.
  const [startTier] = useState(tier);
  const [gpu] = useState(powerPreference);
  const [devTools] = useState(wantsDevTools);
  const glRef = useRef<WebGLRenderer | null>(null);

  useEffect(
    () => () => {
      onRelease();
      // Debug: after React Three Fiber's teardown (scene disposed, renderer disposed, context
      // released), read what the renderer still holds.
      const gl = glRef.current;
      const debug = journeyDebug();
      if (!gl || !debug) return;
      debug.stats = null;
      debug.sample = null;
      debug.ready = false;
      window.setTimeout(() => {
        debug.lastRelease = {
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
          programs: gl.info.programs?.length ?? 0,
          programNames: (gl.info.programs ?? []).map((program) => program.name),
          contextLost: gl.getContext().isContextLost(),
        };
      }, 1000);
    },
    [onRelease],
  );

  return (
    <>
      <Canvas
        dpr={[1, TIER_LIMITS[tier].pixelRatio]}
        gl={{ antialias: startTier !== "low", alpha: false, powerPreference: gpu, toneMapping: NeutralToneMapping }}
        camera={{ position: [0, 0, 8], fov: 35, near: 0.1, far: 50 }}
        onCreated={({ gl }) => {
          glRef.current = gl;
        }}
      >
        <color attach="background" args={[PALETTE.background]} />
        <TestObject tier={tier} />
        <FrameDriver tier={tier} onFirstFrame={onFirstFrame} />
        <ContextLossWatch />
        {DevTools && devTools ? (
          <Suspense fallback={null}>
            <DevTools />
          </Suspense>
        ) : null}
      </Canvas>
      {DevPanel && devTools ? (
        <Suspense fallback={null}>
          <DevPanel />
        </Suspense>
      ) : null}
    </>
  );
}

/**
 * Takes over rendering (priority 1): renders the scene once per frame, measures the frame interval
 * and the frame's CPU time, feeds the downgrade monitor (frame-loop.ts), and pauses the loop while
 * the canvas cannot be seen. Nothing here allocates, reads layout or sets React state per frame:
 * rare events (first frame, a downgrade, a finished sample) leave the loop through a timer.
 */
function FrameDriver({ tier, onFirstFrame }: { tier: RenderTier; onFirstFrame: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const [loop] = useState(() => new FrameLoop(tier));
  const after = useMemo(
    () => ({
      firstFrame: () => onFirstFrame(),
      lower: () => {
        lowerTier();
      },
      failLow: () => {
        failAtLow();
      },
      sampleDone: () => loop.finishSample(performance.now()),
    }),
    [onFirstFrame, loop],
  );

  // A new tier (a downgrade): new limit, and the monitor starts over.
  useEffect(() => {
    if (loop.currentTier !== tier) loop.setTier(tier);
  }, [tier, loop]);

  // Pause while the tab is hidden or no see-through section is in view; on resume the monitor
  // starts over (the first interval spans the pause).
  useEffect(() => {
    const apply = () => {
      const seen = canvasSeen();
      setFrameloop(seen ? "always" : "never");
      if (seen) loop.resume();
    };
    apply();
    return viewStore.subscribe((now, before) => {
      if (canvasSeen(now) !== canvasSeen(before)) apply();
    });
  }, [setFrameloop, loop]);

  // Debug hooks: scene numbers and frame sampling.
  useEffect(() => {
    const debug = journeyDebug();
    if (!debug) return;
    debug.stats = () => readSceneStats(gl, scene, loop.currentTier);
    debug.sample = (durationMs) => loop.sample(durationMs, performance.now());
    return () => {
      debug.stats = null;
      debug.sample = null;
    };
  }, [gl, scene, loop]);

  useFrame((frame, delta) => {
    const start = performance.now();
    const debug = journeyDebug();
    if (debug !== null && debug.loadMs > 0) {
      const end = start + debug.loadMs;
      while (performance.now() < end) {
        // Simulated load (tests only).
      }
    }
    frame.gl.render(frame.scene, frame.camera);
    const interval = delta * 1000;
    const simulated = debug !== null && debug.simulatedFrameMs > 0 ? debug.simulatedFrameMs : interval;
    const events = loop.frame(interval, performance.now() - start, start, journeyStore.getState().forced, simulated);
    if (events & FrameEvent.FirstFrame) window.setTimeout(after.firstFrame, 0);
    if (events & FrameEvent.Downgrade) window.setTimeout(after.lower, 0);
    if (events & FrameEvent.LowFailure) window.setTimeout(after.failLow, 0);
    if (events & FrameEvent.SampleDone) window.setTimeout(after.sampleDone, 0);
    if (debug !== null) {
      if (events & FrameEvent.FirstFrame) debug.ready = true;
      debug.frames += 1;
      debug.monitorP95 = loop.monitor.lastP95;
    }
  }, 1);

  return null;
}

/**
 * Graphics-context loss (STANDARDS.md §2): the first loss in a session is restored (three.js
 * re-uploads the scene on `webglcontextrestored`); a second loss, or a context that does not come
 * back within 5 s, sends the session to the static tier for good (sessionStorage).
 */
function ContextLossWatch() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    let timer = 0;
    const lost = (event: Event) => {
      event.preventDefault(); // ask the browser to restore it
      if (addContextLoss() >= CONTEXT_LOSSES_BEFORE_STATIC) {
        goStatic("context-lost");
        return;
      }
      timer = window.setTimeout(() => {
        if (!gl.getContext().isContextLost()) return;
        addContextLoss();
        goStatic("context-lost");
      }, RESTORE_TIMEOUT_MS);
    };
    const restored = () => window.clearTimeout(timer);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    return () => {
      window.clearTimeout(timer);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  }, [gl]);
  return null;
}
