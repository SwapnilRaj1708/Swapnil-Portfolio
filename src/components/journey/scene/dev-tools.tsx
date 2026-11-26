"use client";

import { button, Leva, useControls } from "leva";
import { Perf } from "r3f-perf";
import { useState } from "react";
import { createPortal } from "react-dom";
import { assetLoadingTuning, MAX_ASSET_WINDOW } from "@/lib/journey/assets/chapter-plan";
import { CHAPTERS, MAX_EXTRA_SCROLL } from "@/lib/journey/chapters";
import { requestAssetPlan } from "../assets/chapter-assets";
import { requestSpineLayout } from "../scroll/scroll-spine";
import { scrollTuning } from "../scroll/scroll.tuning";
import { testObjectTuning as tuning } from "./test-object.tuning";

/**
 * Dev-only tuning panel (leva) and performance overlay (r3f-perf) – STANDARDS.md §5. Present in
 * `next dev` and ENABLE_DEV_PAGES=1 builds only (journey-canvas.tsx imports it behind the inlined
 * JOURNEY_DEV_TOOLS flag); never in a production chunk.
 *
 * The panel writes straight into the tuning object the frame loop reads. "Export values" copies
 * the current values as JSON for the orchestrator (and logs them, in case the clipboard is refused).
 *
 * Placement: leva's own panel sits fixed at the top right, over the end of the desktop navigation
 * (Resume, the Simple-view switch). `DevPanel` mounts the panel itself (a mounted <Leva> replaces
 * the one leva would add on its own), portalled to <body> – the canvas host is aria-hidden, behind
 * the page and takes no pointer events – and moved down by the header's height, so it covers no
 * navigation; the hero copy sits in the left column, so the right side below the header is free.
 * The performance overlay stays at the bottom right.
 */
/** Everything the panel tunes, as the JSON the owner hands back (baked in by the next prompt). */
function currentValues() {
  return {
    testObject: tuning,
    scroll: {
      // Extra scroll length per chapter, in viewport heights (src/lib/journey/chapters.ts).
      extraScroll: Object.fromEntries(CHAPTERS.map((c) => [c.id, c.extraScroll])),
      // src/components/journey/scroll/scroll.tuning.ts
      ...scrollTuning,
    },
    // PF-009: chapters ahead that preload, chapters around the current one that stay loaded
    // (src/lib/journey/assets/chapter-plan.ts).
    assets: { ...assetLoadingTuning },
  };
}

async function exportValues(): Promise<void> {
  const json = JSON.stringify(currentValues(), null, 2);
  console.info(`[tuning] journey\n${json}`);
  try {
    await navigator.clipboard.writeText(json);
  } catch {
    // Clipboard refused (no focus or permission): the JSON is in the console.
  }
}

export function DevTools() {
  useControls("Test object (PF-007)", {
    rotationSpeed: {
      value: tuning.rotationSpeed,
      min: 0,
      max: 2,
      step: 0.01,
      onChange: (v: number) => {
        tuning.rotationSpeed = v;
      },
    },
    emissiveIntensity: {
      value: tuning.emissiveIntensity,
      min: 0,
      max: 4,
      step: 0.05,
      onChange: (v: number) => {
        tuning.emissiveIntensity = v;
      },
    },
    keyLightIntensity: {
      value: tuning.keyLightIntensity,
      min: 0,
      max: 6,
      step: 0.05,
      onChange: (v: number) => {
        tuning.keyLightIntensity = v;
      },
    },
    fillLightIntensity: {
      value: tuning.fillLightIntensity,
      min: 0,
      max: 4,
      step: 0.05,
      onChange: (v: number) => {
        tuning.fillLightIntensity = v;
      },
    },
    "Export values": button(() => {
      void exportValues();
    }),
  });
  // PF-008: each chapter's extra scroll length (viewport heights) and the smoothing values.
  useControls("Scroll (PF-008)", {
    ...Object.fromEntries(
      CHAPTERS.map((c) => [
        `extra ${c.id}`,
        {
          value: c.extraScroll,
          min: 0,
          max: MAX_EXTRA_SCROLL,
          step: 0.05,
          onChange: (v: number) => {
            if (c.extraScroll === v) return;
            c.extraScroll = v;
            requestSpineLayout();
          },
        },
      ]),
    ),
    lenisLerp: {
      value: scrollTuning.lenisLerp,
      min: 0.01,
      max: 1,
      step: 0.01,
      onChange: (v: number) => {
        scrollTuning.lenisLerp = v;
      },
    },
    cameraDamping: {
      value: scrollTuning.cameraDamping,
      min: 0.5,
      max: 30,
      step: 0.5,
      onChange: (v: number) => {
        scrollTuning.cameraDamping = v;
      },
    },
    "Export values": button(() => {
      void exportValues();
    }),
  });
  // PF-009: the per-chapter asset window.
  useControls("Assets (PF-009)", {
    preloadAhead: {
      value: assetLoadingTuning.ahead,
      min: 0,
      max: MAX_ASSET_WINDOW,
      step: 1,
      onChange: (v: number) => {
        if (assetLoadingTuning.ahead === v) return;
        assetLoadingTuning.ahead = v;
        requestAssetPlan();
      },
    },
    keepLoaded: {
      value: assetLoadingTuning.keep,
      min: 0,
      max: MAX_ASSET_WINDOW,
      step: 1,
      onChange: (v: number) => {
        if (assetLoadingTuning.keep === v) return;
        assetLoadingTuning.keep = v;
        requestAssetPlan();
      },
    },
    "Export values": button(() => {
      void exportValues();
    }),
  });
  return <Perf position="bottom-right" />;
}

/** The leva panel, below the header (rendered in the DOM tree, next to the canvas). */
export function DevPanel() {
  // leva's titleBar position is an offset from its fixed corner (10 px from the top right):
  // moved down by the header's bottom edge, measured once, it keeps that 10 px gap below it.
  const [position] = useState(() => ({ x: 0, y: Math.round(document.querySelector("header")?.getBoundingClientRect().bottom ?? 0) }));
  // The wrapper marks the panel for the review captures and the numbers script (`[data-dev-panel]`).
  return createPortal(
    <div data-dev-panel="">
      <Leva titleBar={{ position }} />
    </div>,
    document.body,
  );
}
