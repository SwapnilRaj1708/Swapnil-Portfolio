import { clsx } from "clsx";
import NextLink from "next/link";
import { ui, type Project } from "@/content";
import { ProjectScreen } from "./project-screen";
import { StackList } from "./stack-list";

export type ProjectCardProps = {
  project: Project;
  headingLevel?: 2 | 3;
  /** `wide`: screen beside the text from md up (lead card). `stacked`: screen above the text. */
  layout?: "wide" | "stacked";
  /** `sizes` for the image at this card's width. */
  imageSizes: string;
  /** Show the owner's role (on /work). */
  showRole?: boolean;
  /** The first card at the top of a page: load its image at once (it is the page's LCP). */
  eagerImage?: boolean;
  className?: string;
};

/**
 * One project: its screen (screenshot in the display frame, or a readout tile), org and year,
 * name, one line, role, stack. The name links to the case study; the link covers the whole card,
 * so the card is one tab stop and one click target. Hover and keyboard focus look the same: the
 * border strengthens, the name lights up and the dimmed screenshot lifts to full brightness
 * (on touch screens, which cannot hover, the screenshot is never dimmed).
 * Cards in one grid row stretch to the same height; the action sits at the bottom of each.
 */
export function ProjectCard({
  project,
  headingLevel = 3,
  layout = "stacked",
  imageSizes,
  showRole = false,
  eagerImage = false,
  className,
}: ProjectCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const meta = [project.org, project.year].filter(Boolean).join(" · ");

  return (
    <article
      className={clsx(
        "group relative flex flex-col overflow-hidden rounded-sm border border-line bg-surface",
        "transition-colors duration-fast ease-signal focus-within:border-line-strong hover:border-line-strong",
        layout === "wide" && "md:grid md:grid-cols-2 md:items-start",
        className,
      )}
    >
      <div className={clsx("px-3 pt-3 sm:px-4 sm:pt-4", layout === "wide" && "md:pb-4")}>
        <ProjectScreen project={project} sizes={imageSizes} eager={eagerImage} placement="card" />
      </div>
      <div className={clsx("flex flex-1 flex-col gap-4 p-5 sm:p-6", layout === "wide" && "md:self-stretch")}>
        <p className="label-mono text-text-muted">{meta}</p>
        <Heading className="font-heading text-2xl font-medium text-text">
          <NextLink
            href={`/work/${project.slug}`}
            className="transition-colors duration-fast ease-signal after:absolute after:inset-0 group-focus-within:text-accent-signal group-hover:text-accent-signal"
          >
            {project.name}
          </NextLink>
        </Heading>
        <p className="text-text">{project.oneLine}</p>
        {showRole ? (
          <p className="text-sm text-text-muted">
            <span className="label-mono">{ui.projects.roleLabel}:</span> {project.role}
          </p>
        ) : null}
        <StackList items={project.stack} label={ui.projects.stackLabel} />
        <p aria-hidden="true" className="label-mono mt-auto pt-2 text-accent-signal">
          {ui.projects.caseStudy} →
        </p>
      </div>
    </article>
  );
}
