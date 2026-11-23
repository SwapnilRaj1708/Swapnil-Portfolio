import { clsx } from "clsx";
import type { ReactNode } from "react";

export type SectionHeadingProps = {
  /** Section number, shown two-digit: 3 → "03". */
  index: number;
  /** Short label after the number, e.g. "Experience" → "03 / EXPERIENCE". */
  label: string;
  /** Heading level: sections are h2 by default (the page name is the only h1). */
  level?: 2 | 3;
  id?: string;
  className?: string;
  children: ReactNode;
};

/**
 * Mono index label ("03 / EXPERIENCE") above the section heading. The label repeats the
 * heading, so it is hidden from assistive technology to avoid reading it twice.
 */
export function SectionHeading({ index, label, level = 2, id, className, children }: SectionHeadingProps) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className={clsx("flex flex-col gap-3", className)}>
      <p aria-hidden="true" className="label-mono text-accent-trace">
        {String(index).padStart(2, "0")} / {label}
      </p>
      <Heading
        id={id}
        className={clsx("font-heading font-medium text-text", level === 2 ? "text-3xl" : "text-2xl")}
      >
        {children}
      </Heading>
    </div>
  );
}
