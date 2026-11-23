import { clsx } from "clsx";
import type { ReactNode } from "react";

export type PanelProps = {
  as?: "div" | "section" | "article" | "aside";
  tone?: "surface" | "raised";
  /** Optional mono readout label at the top, e.g. "CH.01 · THE PORT". */
  label?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** A surface for grouped content: sharp corners, hairline border, optional readout label. */
export function Panel({ as: Component = "div", tone = "surface", label, className, children }: PanelProps) {
  return (
    <Component
      className={clsx(
        "relative rounded-sm border border-line p-5 sm:p-6",
        tone === "surface" ? "bg-surface" : "bg-surface-raised",
        // Corner tick: a short trace mark, like an instrument bezel.
        "before:absolute before:top-0 before:left-0 before:h-px before:w-6 before:bg-accent-trace",
        className,
      )}
    >
      {label ? <p className="label-mono mb-4 text-text-muted">{label}</p> : null}
      {children}
    </Component>
  );
}
