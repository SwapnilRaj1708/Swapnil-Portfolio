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
 * `id` replaces the section id – only for a second copy of a section on one page (the dev page
 * /dev/about-portrait), so the ids stay unique.
 */
export function HomeSection({ section, id, children }: { section: HomeSectionData; id?: string; children: ReactNode }) {
  const sectionId = id ?? section.sectionId;
  const headingId = `${sectionId}-heading`;
  return (
    <section id={sectionId} aria-labelledby={headingId} data-chapter={section.chapter}>
      <SectionBanner chapter={section.chapter}>
        <SectionHeading index={section.index} label={section.label} id={headingId}>
          {section.heading}
        </SectionHeading>
      </SectionBanner>
      <Container grid className="gap-y-10 pt-12 pb-section md:pt-16">
        {children}
      </Container>
    </section>
  );
}
