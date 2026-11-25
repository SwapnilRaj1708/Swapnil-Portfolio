/**
 * How scrolling is smoothed in the non-static tiers (STANDARDS.md §1: native scroll; Lenis only
 * smooths). Pure, unit-tested (scroll-mode.test.ts).
 *
 *   lenis   Lenis smooths wheel input – on devices whose primary pointer is fine (mouse, trackpad).
 *           Keyboard, scrollbar and find-in-page stay native; Lenis follows them. The camera
 *           follows the (already smooth) scroll position directly.
 *   native  No Lenis: native scrolling everywhere, and the camera eases toward the scroll position
 *           in the frame loop (critically damped, damping.ts). On touch-first devices (touch keeps
 *           native scrolling, and Lenis would add non-passive touch listeners to the page), and
 *           everywhere with the comparison override `?smooth=off`.
 *
 * `?smooth=off` is a testing and comparison override like `?tier=`: honoured only where the build
 * allows the overrides (never on the production deployment – src/config/journey.ts).
 */

export type ScrollMode = "lenis" | "native";

/** `?smooth=off` from a URL query, where allowed. */
export function parseSmoothOverride(search: string, allowed: boolean): "off" | null {
  if (!allowed) return null;
  return new URLSearchParams(search).get("smooth") === "off" ? "off" : null;
}

export function chooseScrollMode(input: { smoothOverride: "off" | null; finePointer: boolean }): ScrollMode {
  if (input.smoothOverride === "off") return "native";
  return input.finePointer ? "lenis" : "native";
}

/** The camera eases toward the scroll position only where Lenis does not smooth it already. */
export function cameraDamped(mode: ScrollMode): boolean {
  return mode === "native";
}
