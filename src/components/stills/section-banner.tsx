import type { ReactNode } from "react";
import { Container } from "@/components/layout/container";
import { type Chapter, getStill } from "@/content";
import { StillPicture } from "./still-picture";
import { StillScrims } from "./still-scrims";

/** The banner's crop switch: the same breakpoint as Tailwind's `md` (48rem). */
const WIDE_MEDIA = "(min-width: 48rem)";

/**
 * The opening of a home section (PF-028): the chapter's still as a full-bleed banner – 21:9 from
 * `md`, 4:5 below – with the section's index label and heading in its bottom-left corner over the
 * scrim. The box keeps its proportions before the image arrives (no layout shift) and has the
 * background colour, so without the image the heading still reads as designed. Lazy: every banner
 * is below the hero.
 */
export function SectionBanner({ chapter, children }: { chapter: Chapter; children: ReactNode }) {
  return (
    <div className="relative isolate aspect-banner-narrow w-full overflow-hidden bg-background md:aspect-banner-wide">
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <StillPicture still={getStill(chapter)} wideMedia={WIDE_MEDIA} className="absolute inset-0 size-full object-cover object-left" />
        <StillScrims chapter={chapter} wideClassName="hidden md:block" portraitClassName="md:hidden" />
      </div>
      <Container className="absolute inset-x-0 bottom-0 pb-6 md:pb-8 lg:pb-10">
        <div data-over-still={chapter}>{children}</div>
      </Container>
    </div>
  );
}
