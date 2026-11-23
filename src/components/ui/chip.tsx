import { clsx } from "clsx";
import type { InputHTMLAttributes, ReactNode } from "react";

export type ChipProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  /** `radio`: pick one in a group (same `name`). `checkbox`: pick any. */
  type?: "radio" | "checkbox";
  name: string;
  value: string;
  children: ReactNode;
};

/**
 * Selectable chip for option picking (the contact flow uses these). It is a real radio or
 * checkbox input inside its label, so keyboard (Tab, Space, arrow keys in a radio group),
 * screen readers and plain form submission without JavaScript all work natively.
 * Group chips in a ChipGroup (fieldset + legend).
 */
export function Chip({ type = "radio", className, children, ...input }: ChipProps) {
  return (
    <label
      className={clsx(
        // `relative`: the visually hidden input stays inside its chip (focus scrolls to the chip).
        "group relative inline-flex min-h-tap cursor-pointer items-center gap-2 rounded-xs border border-line-strong bg-surface px-4 text-sm text-text",
        "transition-colors duration-fast ease-signal hover:border-text-muted",
        "has-[:checked]:border-accent-signal has-[:checked]:bg-signal-soft",
        "has-[:focus-visible]:focus-ring",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:border-dashed has-[:disabled]:border-line has-[:disabled]:text-text-muted has-[:disabled]:hover:border-line",
        className,
      )}
    >
      <input type={type} className="sr-only" {...input} />
      <span
        aria-hidden="true"
        className={clsx(
          "grid size-3 shrink-0 place-items-center border border-text-muted transition-colors duration-fast ease-signal",
          "group-has-[:checked]:border-accent-signal",
          type === "radio" ? "rounded-full" : "rounded-none",
        )}
      >
        <span
          className={clsx(
            "size-1.5 bg-accent-signal opacity-0 transition-opacity duration-fast ease-signal group-has-[:checked]:opacity-100",
            type === "radio" ? "rounded-full" : "rounded-none",
          )}
        />
      </span>
      {children}
    </label>
  );
}

export type ChipGroupProps = {
  legend: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ChipGroup({ legend, children, className }: ChipGroupProps) {
  return (
    <fieldset className={clsx("flex flex-col gap-3", className)}>
      <legend className="label-mono mb-3 text-text-muted">{legend}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}
