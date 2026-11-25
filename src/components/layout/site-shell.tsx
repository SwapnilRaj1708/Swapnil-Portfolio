import type { ReactNode } from "react";
import { JourneyLayer } from "@/components/journey/gate";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { MAIN_ID, SkipLink } from "./skip-link";

/**
 * Page frame on every route: skip link, header, the one main landmark, footer – and, where the 3D
 * layer is built in (D-39, src/config/journey.ts), the persistent canvas layer behind them. It is
 * mounted here once, so it survives client navigations.
 */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id={MAIN_ID} tabIndex={-1} className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
      {process.env.JOURNEY_LAYER === "on" ? <JourneyLayer /> : null}
    </>
  );
}
