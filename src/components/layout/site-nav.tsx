"use client";

import { clsx } from "clsx";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "@/components/ui/link";
import type { NavItem } from "@/content/site";
import { SimpleViewSwitch } from "./simple-view-switch";

/**
 * Persistent navigation (BRIEF.md §5) and the "Simple view" switch.
 * From `lg` up it is an inline row. Below `lg` it collapses behind a disclosure button:
 * aria-expanded/aria-controls, Escape closes and returns focus to the button, choosing a link
 * closes it. Without JavaScript (`noscript:`) the list is simply shown.
 */
export function SiteNav({ items }: { items: readonly NavItem[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const pathname = usePathname();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    // Close if the window grows to the inline layout while the menu is open.
    const wide = window.matchMedia?.("(min-width: 64rem)");
    const onWide = (event: MediaQueryListEvent) => {
      if (event.matches) close(false);
    };
    document.addEventListener("keydown", onKeyDown);
    wide?.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      wide?.removeEventListener("change", onWide);
    };
  }, [open, close]);

  return (
    <nav aria-label="Main" className="flex items-center">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="label-mono inline-flex min-h-tap items-center gap-2 px-2 text-text transition-colors duration-fast ease-signal hover:text-accent-signal lg:hidden noscript:hidden"
      >
        <span aria-hidden="true" className="relative h-3 w-4">
          <span
            className={clsx(
              "absolute inset-x-0 top-1/2 h-px bg-current transition-transform duration-fast ease-signal",
              open ? "rotate-45" : "-translate-y-1",
            )}
          />
          <span
            className={clsx(
              "absolute inset-x-0 top-1/2 h-px bg-current transition-transform duration-fast ease-signal",
              open ? "-rotate-45" : "translate-y-1",
            )}
          />
        </span>
        Menu
      </button>

      <div
        id={panelId}
        className={clsx(
          // Phone / tablet: a panel under the header.
          "absolute inset-x-0 top-full border-b border-line bg-surface-raised px-gutter pt-2 pb-6",
          open ? "flex" : "hidden",
          "flex-col gap-2",
          // Desktop: inline row in the header.
          "lg:static lg:flex lg:flex-row lg:items-center lg:gap-8 lg:border-0 lg:bg-transparent lg:p-0",
          // No JavaScript: always shown, in the flow.
          "noscript:static noscript:flex noscript:border-0 noscript:bg-transparent noscript:p-0",
        )}
      >
        <ul className="flex flex-col lg:flex-row lg:items-center lg:gap-6 noscript:flex-row noscript:flex-wrap noscript:gap-x-4">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                variant="nav"
                current={pathname === item.href}
                onClick={() => close(false)}
                className="w-full lg:w-auto"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="border-t border-line pt-2 lg:border-0 lg:pt-0">
          <SimpleViewSwitch />
        </div>
      </div>
    </nav>
  );
}
