/**
 * Tunable scroll values (STANDARDS.md §5, PF-008). The dev panel (scene/dev-tools.tsx) writes into
 * this object and exports it with "Export values"; the next prompt bakes the owner's values in here.
 * Read directly by the spine's ticker and the camera rig's frame loop (no React state). The extra
 * scroll length of each chapter lives in the chapter registry (src/lib/journey/chapters.ts).
 */
export const scrollTuning = {
  /**
   * Lenis's smoothing of wheel input (0–1): the share of the remaining distance covered per 60 Hz
   * frame, frame-rate independent. Lower = smoother and slower to settle. 0.1 is Lenis's default.
   */
  lenisLerp: 0.1,
  /**
   * Stiffness (rad/s) of the camera's critically damped ease toward the scroll position, where
   * Lenis does not smooth (`?smooth=off`, touch-first devices). Higher = follows more tightly.
   */
  cameraDamping: 6,
};

export type ScrollTuning = typeof scrollTuning;
