import { clsx } from "clsx";
import type { ReactNode } from "react";
import { ui, type Media, type Project } from "@/content";
import { ProjectImage } from "./project-image";

/** Label for each reason a project has no public preview (the words live in the UI content). */
const NO_PREVIEW_LABEL = {
  "behind-sign-in": ui.projects.previewBehindSignIn,
} satisfies Record<NonNullable<Project["noPublicPreview"]>, string>;

export type ScreenFrameProps = {
  children: ReactNode;
  /** `screen`: a fixed 16:10 screen. `band`: full width, at least the readout-band height. */
  shape?: "screen" | "band";
  /** Bezel colour: `background` inside cards (which sit on `surface`), `surface` on a page. */
  tone?: "background" | "surface";
  className?: string;
};

/**
 * The display frame: a dark bezel with a thin border round the screen. Purely decorative – plain
 * boxes with no role; whatever sits inside keeps its own semantics (an image keeps its alt text).
 */
export function ScreenFrame({ children, shape = "screen", tone = "background", className }: ScreenFrameProps) {
  return (
    <div
      className={clsx(
        "rounded-sm border border-line-strong p-1.5",
        tone === "surface" ? "bg-surface" : "bg-background",
        className,
      )}
    >
      <div
        className={clsx(
          "relative overflow-hidden rounded-xs border border-line bg-surface-raised",
          shape === "band" ? "flex min-h-readout-band flex-col" : "aspect-screen",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export type ProjectScreenProps = {
  project: Project;
  /** The image to show; defaults to the project's first. Without one, the readout tile is shown. */
  media?: Media;
  /** `sizes` for the image at this frame's width. */
  sizes: string;
  /** Load the image at once (the page's LCP). */
  eager?: boolean;
  /**
   * `card` (the card is the `group`): background bezel, 16:10 screen; the screenshot rests
   * slightly dimmed and lifts to full brightness while the card is hovered or has keyboard focus
   * – only on devices that can hover (see `screen-dim`); reduced motion: no transition, same end
   * states. `page` (a case study): surface bezel, the screenshot at full brightness, and without
   * media the readout tile as a short band rather than a full screen.
   */
  placement?: "card" | "page";
  className?: string;
};

/** A project's screen: its screenshot in the display frame, or a readout tile when it has none. */
export function ProjectScreen({ project, media, sizes, eager = false, placement = "card", className }: ProjectScreenProps) {
  const shown = media ?? project.media[0];
  const onPage = placement === "page";
  return (
    <ScreenFrame className={className} tone={onPage ? "surface" : "background"} shape={onPage && !shown ? "band" : "screen"}>
      {shown ? (
        <ProjectImage
          media={shown}
          sizes={sizes}
          eager={eager}
          className={clsx(
            !onPage &&
              "screen-dim transition duration-moderate ease-signal group-focus-within:filter-none group-hover:filter-none motion-reduce:transition-none",
          )}
        />
      ) : (
        <ReadoutTile project={project} size={onPage ? "lg" : "md"} />
      )}
    </ScreenFrame>
  );
}

/**
 * Stands in for a screenshot: the project name in the heading face over a thin trace line, and –
 * where the data marks it – why there is no preview. The name and line repeat the card or page
 * heading, so they are hidden from assistive technology; the label is new information and is read.
 */
function ReadoutTile({ project, size }: { project: Project; size: "md" | "lg" }) {
  const label = project.noPublicPreview ? NO_PREVIEW_LABEL[project.noPublicPreview] : undefined;
  return (
    <div className={clsx("flex flex-1 flex-col bg-surface-raised", size === "lg" ? "p-6 sm:p-8" : "h-full p-5 sm:p-6")}>
      {label ? <p className="label-mono text-text-muted">{label}</p> : null}
      <div aria-hidden="true" className={clsx("mt-auto flex flex-col gap-3", label && "pt-4")}>
        <span className={clsx("block h-px bg-accent-trace", size === "lg" ? "w-16" : "w-12")} />
        <p className={clsx("font-heading font-medium text-text", size === "lg" ? "text-3xl" : "text-xl")}>{project.name}</p>
      </div>
    </div>
  );
}
