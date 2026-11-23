"use client";

import { clsx } from "clsx";
import { setSimpleView } from "@/lib/simple-view";
import { useSimpleView } from "@/lib/use-simple-view";

/**
 * "Simple view" switch (STANDARDS.md §2): a toggle button with aria-pressed. The choice is
 * remembered (src/lib/simple-view.ts); PF-007 makes it select the static tier. Hidden without
 * JavaScript, where it could do nothing.
 */
export function SimpleViewSwitch({ className }: { className?: string }) {
  const on = useSimpleView();
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => setSimpleView(!on)}
      className={clsx(
        "group label-mono inline-flex min-h-tap items-center gap-3 text-text-muted transition-colors duration-fast ease-signal hover:text-text aria-pressed:text-text noscript:hidden",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="relative inline-flex h-4 w-7 shrink-0 items-center rounded-xs border border-line-strong bg-surface transition-colors duration-fast ease-signal group-aria-pressed:border-accent-signal group-aria-pressed:bg-signal-soft"
      >
        <span className="absolute left-0.5 size-2.5 rounded-none bg-text-muted transition duration-fast ease-signal group-aria-pressed:translate-x-3.5group-aria-pressed:bg-accent-signal" />
      </span>
      Simple view
    </button>
  );
}
