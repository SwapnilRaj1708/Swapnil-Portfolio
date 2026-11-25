"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore, type ComponentType, type ReactNode } from "react";

/**
 * The 3D layer's entry points, switched at build time (D-39, src/config/journey.ts).
 *
 * `process.env.JOURNEY_LAYER` is inlined by next.config.ts. Where it is "off" (the production
 * deployment until PF-026) the `if` below is dead code: the bundler drops both imports and the
 * chapter hook, so neither the loader, the tier store nor the 3D chunk exist in that build. The
 * server components also render these only when the layer is on, so production HTML is the stage 1
 * page byte for byte.
 */

type BackdropProps = { children: ReactNode };

function Off() {
  return null;
}

function Passthrough({ children }: BackdropProps) {
  return <>{children}</>;
}

function useNoChapter(): string | null {
  return null;
}

let Layer: ComponentType = Off;
let Backdrop: ComponentType<BackdropProps> = Passthrough;
let useChapterSection: () => string | null = useNoChapter;

if (process.env.JOURNEY_LAYER === "on") {
  // The loader: nothing to render on the server; it starts after hydration (journey-layer.tsx).
  Layer = dynamic(() => import("./journey-layer").then((m) => m.JourneyLayer), { ssr: false });
  // Rendered on the server too: without JavaScript the still must be in the HTML (in <noscript>).
  Backdrop = dynamic(() => import("./tier-backdrop").then((m) => m.TierBackdrop));

  // The current chapter's section id (PF-008), published by the scroll spine in the lazy chunk
  // (src/lib/journey/chapter-bridge.ts – this file may not import it, so the attribute and event
  // names are repeated here; site-nav.test.tsx publishes through that module and checks the
  // navigation follows). null on the server, in the static tier and on other pages.
  const subscribe = (onChange: () => void) => {
    window.addEventListener("journey:chapter", onChange);
    return () => window.removeEventListener("journey:chapter", onChange);
  };
  const read = () => document.documentElement.getAttribute("data-journey-section");
  const readOnServer = () => null;
  useChapterSection = function useChapterSectionOn() {
    return useSyncExternalStore(subscribe, read, readOnServer);
  };
}

/** The persistent canvas layer (site shell). */
export function JourneyLayer() {
  return <Layer />;
}

/**
 * A see-through section's static backdrop (the hero's Port still, the banners' stills): drawn only
 * in the static tier, never even requested on the render tiers, where the canvas shows through.
 */
export function TierBackdrop({ children }: BackdropProps) {
  return <Backdrop>{children}</Backdrop>;
}

/**
 * The section id of the chapter the visitor is in (`about`, `work` …), for the navigation's
 * current-location mark. Re-renders only when the chapter changes, never on scroll. Always null
 * where the 3D layer is not built in, and in the static tier.
 */
export function useJourneyChapter(): string | null {
  return useChapterSection();
}
