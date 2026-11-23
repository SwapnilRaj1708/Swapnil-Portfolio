import { clsx } from "clsx";

export type StatusChipProps = {
  /** The availability text (BRIEF.md §8), from the content data. */
  children: string;
  className?: string;
};

/**
 * Availability readout: a lit signal dot and the status text. A soft ring pulses out of the dot
 * (an ambient loop); with reduced motion the ring is not shown and the dot stays steady.
 */
export function StatusChip({ children, className }: StatusChipProps) {
  return (
    <p
      className={clsx(
        "inline-flex max-w-full items-center gap-3 rounded-xs border border-line bg-surface px-3 py-2 font-mono text-sm text-text",
        className,
      )}
    >
      <span aria-hidden="true" data-status-dot className="relative grid size-2 shrink-0 place-items-center">
        <span
          data-status-pulse
          className="absolute inset-0 rounded-full bg-accent-signal opacity-0 animate-signal-pulse"
        />
        <span className="relative size-2 rounded-full bg-accent-signal shadow-signal-halo" />
      </span>
      <span>{children}</span>
    </p>
  );
}
