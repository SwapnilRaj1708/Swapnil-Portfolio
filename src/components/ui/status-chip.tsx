import { clsx } from "clsx";

export type StatusChipProps = {
  /** The availability text (BRIEF.md §8), from the content file. */
  children: string;
  className?: string;
};

/** Availability readout: a softly pulsing signal dot and the status text. */
export function StatusChip({ children, className }: StatusChipProps) {
  return (
    <p
      className={clsx(
        "inline-flex max-w-full items-center gap-3 rounded-xs border border-line bg-surface px-3 py-2 font-mono text-sm text-text",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full bg-accent-signal shadow-signal-halo animate-signal-pulse"
      />
      <span>{children}</span>
    </p>
  );
}
