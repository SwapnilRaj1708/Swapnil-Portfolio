import { CARD_IMAGE_SIZES } from "@/components/projects/image-sizes";
import { ProjectCard } from "@/components/projects/project-card";
import { Link } from "@/components/ui/link";
import { featuredProjects, getHomeSection, ui } from "@/content";
import { HomeSection } from "./home-section";

/** Chapter `array` (#work): the featured projects in the owner's order, each to its case study. */
export function ProjectsSection() {
  const [lead, ...rest] = featuredProjects;
  return (
    <HomeSection section={getHomeSection("array")}>
      <ul className="col-span-full grid gap-4 md:grid-cols-2">
        <li className="md:col-span-2">
          <ProjectCard project={lead} layout="wide" imageSizes={CARD_IMAGE_SIZES} className="h-full" />
        </li>
        {rest.map((project) => (
          <li key={project.slug}>
            <ProjectCard project={project} imageSizes={CARD_IMAGE_SIZES} className="h-full" />
          </li>
        ))}
      </ul>
      <p className="col-span-full">
        <Link href="/work" variant="nav" className="text-accent-signal">
          {ui.projects.allWork} →
        </Link>
      </p>
    </HomeSection>
  );
}
