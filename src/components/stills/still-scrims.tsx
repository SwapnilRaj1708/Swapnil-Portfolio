import { clsx } from "clsx";
import type { Chapter } from "@/content";
import { STILL_LAYOUT, scrimGradient } from "@/styles/stills";

/**
 * The scrims over a still (src/styles/stills.ts): gradients of the background colour that keep
 * the text on the image at 4.5:1 or more. One layer per crop, each shown on the screens that get
 * that crop – the caller passes the classes that match its `<picture>` media query.
 */
export function StillScrims({ chapter, wideClassName, portraitClassName }: { chapter: Chapter; wideClassName: string; portraitClassName: string }) {
  const layout = STILL_LAYOUT[chapter];
  return (
    <>
      <div
        aria-hidden="true"
        className={clsx("absolute inset-0", wideClassName)}
        style={{ backgroundImage: layout.wide.scrims.map(scrimGradient).join(", ") }}
      />
      <div
        aria-hidden="true"
        className={clsx("absolute inset-0", portraitClassName)}
        style={{ backgroundImage: layout.portrait.scrims.map(scrimGradient).join(", ") }}
      />
    </>
  );
}
