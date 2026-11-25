import { clsx } from "clsx";
import type { ReactNode } from "react";
import { TierBackdrop } from "@/components/journey/gate";
import { Container } from "@/components/layout/container";
import { type Chapter, getStill } from "@/content";
import { StillPicture } from "./still-picture";
import { StillScrims } from "./still-scrims";

/** The banner's crop switch: the same breakpoint as Tailwind's `md` (48rem). */
const WIDE_MEDIA = "(min-width: 48rem)";

/** The banner box: full-bleed, 4:5 below `md`, 21:9 from `md`, at least as tall as its text. */
const BOX = "relative isolate flex aspect-banner-narrow w-full flex-col justify-end overflow-clip md:aspect-banner-wide";

/**
 * The opening of a home section (PF-028): the chapter's still as a full-bleed banner – 21:9 from
 * `md`, 4:5 below – with the section's index label and heading in its bottom-left corner over the
 * scrim. The box keeps its proportions before the image arrives (no layout shift) and has the
 * background colour, so without the image the heading still reads as designed. Lazy: every banner
 * is below the hero.
 *
 * The label and heading are in normal flow at the bottom of the box (flex column, `justify-end`),
 * never positioned out of it: the banner is always at least as tall as its text. The aspect ratio
 * is a minimum – `overflow-clip` is not a scroll container, so the box grows with large text or
 * zoom instead of clipping the heading – and if the ratio is ever lost (the PF-028 Vercel preview
 * shipped CSS without it) the heading still shows, on the background colour. Only the still is
 * clipped. e2e/stills.spec.ts checks this with the stills blocked and the ratio removed.
 *
 * With the 3D layer built in (D-39, PF-008) the banner is a window onto the canvas: the box is
 * transparent and its still goes through the tier backdrop – drawn (on the background colour) only
 * in the static tier, never downloaded on a render tier. While the canvas is mounted the label and
 * heading stand on the canvas scrim (`canvas:canvas-scrim`). The production deployment renders the
 * stage 1 banner exactly.
 */
export function SectionBanner({ chapter, children }: { chapter: Chapter; children: ReactNode }) {
  const journey = process.env.JOURNEY_LAYER === "on";
  const backdrop = (
    <div aria-hidden="true" className={journey ? "absolute inset-0 -z-10 bg-background" : "absolute inset-0 -z-10"}>
      <StillPicture still={getStill(chapter)} wideMedia={WIDE_MEDIA} className="absolute inset-0 size-full object-cover object-left" />
      <StillScrims chapter={chapter} wideClassName="hidden md:block" portraitClassName="md:hidden" />
    </div>
  );
  return (
    <div className={journey ? BOX : "relative isolate flex aspect-banner-narrow w-full flex-col justify-end overflow-clip bg-background md:aspect-banner-wide"}>
      {journey ? <TierBackdrop>{backdrop}</TierBackdrop> : backdrop}
      <Container className={clsx("pt-6 pb-6 md:pb-8 lg:pb-10", journey && "canvas:canvas-scrim")}>
        <div data-over-still={chapter}>{children}</div>
      </Container>
    </div>
  );
}
