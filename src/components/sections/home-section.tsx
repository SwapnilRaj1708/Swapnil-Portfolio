import type { ReactNode } from "react";
import { Container } from "@/components/layout/container";
import { SectionHeading } from "@/components/ui/section-heading";
import type { HomeSection as HomeSectionData } from "@/content";

/**
 * Frame of one home-page section = one journey chapter (BRIEF.md §3): the section id the
 * navigation and the journey target, the "02 / ABOUT" index label and the h2.
 */
export function HomeSection({ section, children }: { section: HomeSectionData; children: ReactNode }) {
  const headingId = `${section.sectionId}-heading`;
  return (
    <section id={section.sectionId} aria-labelledby={headingId} data-chapter={section.chapter} className="border-t border-line py-section">
      <Container grid className="gap-y-10">
        <SectionHeading index={section.index} label={section.label} id={headingId} className="col-span-full lg:col-span-4">
          {section.heading}
        </SectionHeading>
        {children}
      </Container>
    </section>
  );
}
