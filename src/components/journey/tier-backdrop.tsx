"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useStore } from "zustand";
import { changeMountedWindows, changeVisibleWindows, journeyStore } from "@/lib/journey/store";

/**
 * The backdrop of a section the canvas shows through (today: the hero). Its parent section is a
 * "canvas window": while it intersects the viewport the canvas renders; when no window does, the
 * canvas is fully covered and the frame loop pauses (STANDARDS.md §4).
 *
 * The backdrop itself (the Port still and its scrims) is drawn only in the static tier. Before the
 * tier is known – on the server and during hydration – and on every render tier it sits inside
 * <noscript>: browsers with JavaScript never parse it, so the still is not downloaded, and browsers
 * without JavaScript draw it exactly as the stage 1 hero. When the tier turns out static (one of
 * the triggers in docs/architecture.md), it is rendered and loads at once at high priority.
 */
export function TierBackdrop({ children }: { children: ReactNode }) {
  const tier = useStore(journeyStore, (s) => s.tier);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    changeMountedWindows(1);
    return () => changeMountedWindows(-1);
  }, []);

  useEffect(() => {
    const section = ref.current?.parentElement;
    if (!section || typeof IntersectionObserver === "undefined") return;
    let inView = false;
    const observer = new IntersectionObserver((entries) => {
      const now = entries[entries.length - 1]?.isIntersecting ?? false;
      if (now === inView) return;
      inView = now;
      changeVisibleWindows(now ? 1 : -1);
    });
    observer.observe(section);
    return () => {
      observer.disconnect();
      if (inView) changeVisibleWindows(-1);
    };
  }, []);

  return (
    <div ref={ref} className="absolute inset-0 -z-10" data-tier-backdrop={tier}>
      {tier === "static" ? children : <noscript>{children}</noscript>}
    </div>
  );
}
