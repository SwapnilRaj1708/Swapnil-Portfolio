/**
 * When has a nav jump landed? (PF-009 follow-up 1.) A jump to a chapter (scroll-spine.tsx) moves
 * focus to the section only once the page is verifiably at the chapter's start – never on the
 * strength of a `scrollend` event alone. A `scrollend` can belong to another scroll: an instant
 * scroll just before the jump (a focused header link scrolled "into view", which Chromium did for a
 * link inside the `scroll-padding-top` band until PF-030 moved the header offset to the targets'
 * `scroll-margin-top`) dispatches its `scrollend` a frame later, and on a busy main thread that is
 * after the jump has begun (PF-009 CI failure). Any other instant scroll can do the same.
 *
 * The browser's smooth scroll is watched once per animation frame instead:
 *   landed   at the target (within `tolerance`) and unchanged since the previous frame;
 *   stalled  not at the target and unchanged for `stallFrames` frames and `stallMs` – the browser's
 *            smooth scroll was cancelled (an instant scroll by something else: a ScrollTrigger
 *            refresh records the position, scrolls to 0 and back) and the spine re-targets;
 *   moving   anything else.
 * Pure, so it is unit-tested; the spine owns the frames, the timers and the input listeners.
 */

export const jumpTuning = {
  /** A position this close to the target (px) is the target (a fractional start lands on a whole pixel). */
  tolerance: 1,
  /** Movement below this (px) between two frames counts as standing still. */
  still: 0.5,
  /** A stall needs this many still frames … */
  stallFrames: 3,
  /** … spanning at least this long (ms): a smooth scroll may take a frame or two to start moving. */
  stallMs: 300,
  /** Re-targets per jump (layout changes, refreshes, stalls) before it lands instantly instead. */
  maxRetargets: 4,
  /** A jump that has not landed after this long (ms) lands instantly. */
  timeoutMs: 8000,
} as const;

export type JumpWatch = {
  lastY: number;
  stillFrames: number;
  stillSince: number;
};

export type JumpWatchState = "moving" | "landed" | "stalled";

/** A watch starting at scroll position `y` at time `now` (ms). */
export function createJumpWatch(y: number, now: number): JumpWatch {
  return { lastY: y, stillFrames: 0, stillSince: now };
}

/** Feeds one frame's scroll position `y` (target `target`, time `now` in ms) into the watch. */
export function watchJump(watch: JumpWatch, y: number, target: number, now: number, tuning = jumpTuning): JumpWatchState {
  if (Math.abs(y - watch.lastY) >= tuning.still) {
    watch.stillFrames = 0;
    watch.stillSince = now;
  } else {
    watch.stillFrames += 1;
  }
  watch.lastY = y;
  if (Math.abs(y - target) <= tuning.tolerance) return watch.stillFrames >= 1 ? "landed" : "moving";
  if (watch.stillFrames >= tuning.stallFrames && now - watch.stillSince >= tuning.stallMs) return "stalled";
  return "moving";
}
