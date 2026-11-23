import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { CARD_IMAGE_SIZES } from "@/components/projects/image-sizes";
import { ProjectCard } from "@/components/projects/project-card";
import { featuredProjects, moreProjects, site, ui } from "@/content";

export const metadata: Metadata = {
  title: site.meta.work.title,
  description: site.meta.work.description,
};

/** /work – every project, featured first (BRIEF.md §5, the fast lane). No WebGL. */
export default function WorkPage() {
  const groups = [
    { id: "featured", heading: ui.work.featuredHeading, projects: featuredProjects },
    { id: "more", heading: ui.work.moreHeading, projects: moreProjects },
  ].filter((g) => g.projects.length > 0);

  return (
    <>
      <PageHeader title={ui.work.heading} intro={<p>{ui.work.intro}</p>} />
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`${group.id}-heading`} className="pb-section">
          <Container className="flex flex-col gap-6">
            <h2 id={`${group.id}-heading`} className="label-mono border-b border-line pb-3 text-accent-trace">
              {group.heading}
            </h2>
            <ul className="grid gap-4 md:grid-cols-2">
              {group.projects.map((project, i) => (
                <li key={project.slug}>
                  <ProjectCard
                    project={project}
                    imageSizes={CARD_IMAGE_SIZES}
                    showRole
                    // The first card's image is in the first screen on phones: fetch it at once.
                    eagerImage={group.id === "featured" && i === 0}
                    className="h-full"
                  />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ))}
    </>
  );
}
