"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type ComponentType } from "react";
import { useStore } from "zustand";
import { installJourneyDebug } from "@/lib/journey/debug";
import { probeWebGl2, readCapabilitySignals, readStaticSignals, REDUCED_MOTION_QUERY, type WebGl2Probe } from "@/lib/journey/signals";
import { canvasSeen, enterRenderTier, goStatic, journeyStore, setPageVisible, viewStore } from "@/lib/journey/store";
import { chooseGpuPreference, decideTier, isRenderTier, parseTierOverride, type GpuPreference, type RenderTier } from "@/lib/journey/tiers";
import { useSimpleView } from "@/lib/use-simple-view";
import type { JourneyCanvasProps } from "./scene/journey-canvas";

/**
 * The persistent canvas layer (STANDARDS.md §1, §2): mounted once in the site shell, so it lives
 * across client navigations. In order:
 *
 *   1. After hydration, the cheap synchronous checks: the `?tier=` override (not on production),
 *      simple view, reduced motion, data saver, the session's context-loss and low-failure flags,
 *      a failed chunk, then a WebGL 2 probe (no WebGL 2, a software renderer). Any static trigger
 *      ends here: no canvas, no download (tiers.ts `decideTier` has the order and the bypasses).
 *   2. Otherwise the start tier (capabilities, never above the session's floor) goes into the
 *      tier store, and once the page has loaded, the browser is idle and the page has a section
 *      the canvas shows through (the home hero; not /work or /resume), the 3D chunk is imported
 *      (three, React Three Fiber and the scene: scene/journey-canvas.tsx). If that fails the
 *      visitor gets the static tier, without an error overlay.
 *   3. The canvas fades in behind the page once its first frame is drawn, and only while a
 *      see-through section (the hero) is in view.
 *
 * Simple view and reduced motion are watched: turning either on unmounts the canvas (which frees
 * everything on the GPU); turning it off runs the checks again.
 */

type SceneComponent = ComponentType<JourneyCanvasProps>;

let sceneImport: Promise<SceneComponent> | null = null;
let chunkFailed = false;
let probe: WebGl2Probe | null = null;

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** Resolves after the load event, when the browser is next idle (or after 2 s at the latest). */
function afterLoadAndIdle(): Promise<void> {
  return new Promise((resolve) => {
    const idle = () => {
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(() => resolve(), { timeout: 2000 });
      else window.setTimeout(resolve, 200);
    };
    if (document.readyState === "complete") idle();
    else window.addEventListener("load", idle, { once: true });
  });
}

function mark(name: string): void {
  try {
    performance.mark(name);
  } catch {
    // Marks are for the tests and the numbers script only.
  }
}

const overrideAllowed = () => process.env.JOURNEY_TIER_OVERRIDE === "on";

/** The GPU the canvas (and the probe) asks for: visitors "high-performance"; `?gpu=low-power` off production. */
function gpuPreference(): GpuPreference {
  return chooseGpuPreference(window.location.search, overrideAllowed());
}

/** Step 1 and the start of step 2: decides the tier into the store (tiers.ts `decideTier`). */
function decideAndStoreTier(): void {
  const decision = decideTier({
    override: parseTierOverride(window.location.search, overrideAllowed()),
    staticSignals: readStaticSignals(chunkFailed),
    probe: () => (probe ??= probeWebGl2(gpuPreference())),
    capabilities: readCapabilitySignals,
  });
  if (decision.tier === "static") goStatic(decision.reason);
  else enterRenderTier(decision.tier, decision.reason, decision.forced);
}

export function JourneyLayer() {
  const tier = useStore(journeyStore, (s) => s.tier);
  const seen = useStore(viewStore, (s) => canvasSeen(s));
  const hasWindow = useStore(viewStore, (s) => s.mounted > 0);
  const simpleView = useSimpleView();
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
  const [Scene, setScene] = useState<SceneComponent | null>(null);
  const [drawn, setDrawn] = useState(false);
  // Stable: the canvas calls them once (first frame) and on unmount.
  const onFirstFrame = useCallback(() => setDrawn(true), []);
  const onRelease = useCallback(() => setDrawn(false), []);
  const renderTier: RenderTier | null = isRenderTier(tier) ? tier : null;
  const wantsCanvas = renderTier !== null;

  // Page visibility: no frames while the tab is hidden.
  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  // Step 1 (again whenever simple view or reduced motion changes).
  useEffect(() => {
    installJourneyDebug(() => journeyStore.getState());
    mark("journey:checks");
    decideAndStoreTier();
    mark("journey:decided");
  }, [simpleView, reducedMotion]);

  // Step 2: the chunk, once, after load and idle – and only on a page the canvas can show
  // through (a client navigation to such a page loads it then).
  useEffect(() => {
    if (!wantsCanvas || !hasWindow || Scene) return;
    let cancelled = false;
    void afterLoadAndIdle().then(() => {
      if (cancelled) return;
      if (!sceneImport) {
        mark("journey:chunk-request");
        sceneImport = import("./scene/journey-canvas").then((m) => {
          mark("journey:chunk-loaded");
          return m.JourneyCanvas;
        });
      }
      sceneImport.then(
        (component) => {
          if (!cancelled) setScene(() => component);
        },
        () => {
          // The 3D chunk failed (offline, blocked, a deploy replaced it): static for this page,
          // quietly – the static home is complete on its own.
          sceneImport = null;
          chunkFailed = true;
          if (isRenderTier(journeyStore.getState().tier)) goStatic("chunk-failed");
        },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [wantsCanvas, hasWindow, Scene]);

  if (!renderTier || !Scene) return null;
  return (
    <div
      aria-hidden="true"
      data-journey-host=""
      data-shown={drawn && seen ? "" : undefined}
      className="pointer-events-none fixed inset-0 -z-10 opacity-0 transition-opacity duration-slow ease-signal data-shown:opacity-100"
    >
      <Scene tier={renderTier} powerPreference={gpuPreference()} onFirstFrame={onFirstFrame} onRelease={onRelease} />
    </div>
  );
}
