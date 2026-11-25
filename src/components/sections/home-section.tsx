import type { ReactNode } from "react";
import { Container } from "@/components/layout/container";
import { SectionBanner } from "@/components/stills/section-banner";
import { SectionHeading } from "@/components/ui/section-heading";
import type { HomeSection as HomeSectionData } from "@/content";

/**
 * Frame of one home-page section = one journey chapter (BRIEF.md §3): the section id the
 * navigation and the journey target, then the chapter's still as a banner (PF-028) carrying the
 * "02 / ABOUT" index label and the h2, then the section's content on the grid. With the 3D
 * layer built in (D-39) it is opaque – the page background, the colour behind it anyway – so the
 * canvas shows through the hero only (PF-007).
 */
export function HomeSection({ section, children }: { section: HomeSectionData; children: ReactNode }) {
  const headingId = `${section.sectionId}-heading`;
  return (
    <section
      id={section.sectionId}
      aria-labelledby={headingId}
      data-chapter={section.chapter}
      className={process.env.JOURNEY_LAYER === "on" ? "bg-background" : undefined}
    >
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
