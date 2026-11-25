"use client";

import dynamic from "next/dynamic";
import type { ComponentType, ReactNode } from "react";

/**
 * The 3D layer's entry points, switched at build time (D-39, src/config/journey.ts).
 *
 * `process.env.JOURNEY_LAYER` is inlined by next.config.ts. Where it is "off" (the production
 * deployment until PF-026) the `if` below is dead code: the bundler drops both imports, so neither
 * the loader, the tier store nor the 3D chunk exist in that build. The server components also
 * render these only when the layer is on, so production HTML is the stage 1 page byte for byte.
 */

type BackdropProps = { children: ReactNode };

function Off() {
  return null;
}

function Passthrough({ children }: BackdropProps) {
  return <>{children}</>;
}

let Layer: ComponentType = Off;
let Backdrop: ComponentType<BackdropProps> = Passthrough;

if (process.env.JOURNEY_LAYER === "on") {
  // The loader: nothing to render on the server; it starts after hydration (journey-layer.tsx).
  Layer = dynamic(() => import("./journey-layer").then((m) => m.JourneyLayer), { ssr: false });
  // Rendered on the server too: without JavaScript the still must be in the HTML (in <noscript>).
  Backdrop = dynamic(() => import("./tier-backdrop").then((m) => m.TierBackdrop));
}

/** The persistent canvas layer (site shell). */
export function JourneyLayer() {
  return <Layer />;
}

/**
 * A see-through section's static backdrop (the hero's Port still): drawn only in the static tier,
 * never even requested on the render tiers, where the canvas shows through instead.
 */
export function TierBackdrop({ children }: BackdropProps) {
  return <Backdrop>{children}</Backdrop>;
}
