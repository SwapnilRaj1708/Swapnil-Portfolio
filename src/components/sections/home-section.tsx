import { clsx } from "clsx";
import type { ReactNode } from "react";
import { Container } from "@/components/layout/container";
import { SectionBanner } from "@/components/stills/section-banner";
import { SectionHeading } from "@/components/ui/section-heading";
import type { HomeSection as HomeSectionData } from "@/content";

/**
 * Frame of one home-page section = one journey chapter (BRIEF.md §3): the section id the
 * navigation and the journey target, then the chapter's still as a banner (PF-028) carrying the
 * "02 / ABOUT" index label and the h2, then the section's content on the grid.
 *
 * With the 3D layer built in (D-39) the section is see-through (PF-008): the canvas shows behind
 * the whole home page – through the banner, which draws its still only in the static tier – and
 * while the canvas is mounted the content stands on the canvas scrim (`canvas:canvas-scrim`, at
 * least 4.5:1 for every text colour whatever the scene shows). In the static tier there is no
 * canvas: the page background shows, exactly as in stage 1.
 */
export function HomeSection({ section, children }: { section: HomeSectionData; children: ReactNode }) {
  const headingId = `${section.sectionId}-heading`;
  const journey = process.env.JOURNEY_LAYER === "on";
  return (
    <section id={section.sectionId} aria-labelledby={headingId} data-chapter={section.chapter}>
      <SectionBanner chapter={section.chapter}>
        <SectionHeading index={section.index} label={section.label} id={headingId}>
          {section.heading}
        </SectionHeading>
      </SectionBanner>
      <Container grid className={clsx("gap-y-10 pt-12 pb-section md:pt-16", journey && "canvas:canvas-scrim")}>
        {children}
      </Container>
    </section>
  );
}
