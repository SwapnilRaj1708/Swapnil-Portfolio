/**
 * The scroll spine's maths (STANDARDS.md §1): scroll position → `progress`, and the chapter the
 * position lies in → `chapter` + `chapterProgress`. Pure functions, unit-tested
 * (scroll-math.test.ts); the browser reads happen in the spine (scroll-spine.tsx).
 *
 * Scroll positions are in CSS px from the top of the page. `max` is the largest scroll position:
 * the document's scroll height minus the viewport height.
 */

/** Within this many px of the end, the page is at its end: progress is exactly 1. */
export const END_TOLERANCE_PX = 0.5;

/**
 * A chapter starts this many px before its measured boundary. A jump to a section lands on a whole
 * (or device) pixel, while a section's top can be fractional: 1 px of slack keeps such a landing in
 * the chapter it was aimed at.
 */
export const BOUNDARY_TOLERANCE_PX = 1;

/** The largest scroll position (0 when the page does not scroll). */
export function maxScrollOf(scrollHeight: number, viewportHeight: number): number {
  const max = scrollHeight - viewportHeight;
  return Number.isFinite(max) && max > 0 ? max : 0;
}

/**
 * progress = scroll position / (document scroll height − viewport height), clamped to 0–1:
 * exactly 0 at the top and exactly 1 at the bottom (within END_TOLERANCE_PX, since the browser may
 * stop a fraction of a pixel short of a fractional maximum). A page that does not scroll is at 0.
 */
export function scrollToProgress(scroll: number, max: number): number {
  if (!(max > 0) || !(scroll > 0)) return 0;
  if (scroll >= max - END_TOLERANCE_PX) return 1;
  return scroll / max;
}

/**
 * The scroll position at which each chapter starts, from its section's top (document px).
 * A section "starts" when its top reaches the bottom of the fixed header – the browser's own
 * anchor landing (the section's `scroll-margin-top`, PF-030), so a jump or a deep link to `#about` lands exactly on the
 * bus chapter's start. The first chapter starts at 0 (the top of the page). Each boundary is
 * clamped to 0–max and never before the previous one (sections are in document order).
 */
export function chapterBoundaries(sectionTops: readonly number[], headerOffset: number, max: number, out: number[] = []): number[] {
  out.length = sectionTops.length;
  let previous = 0;
  for (let i = 0; i < sectionTops.length; i++) {
    const raw = i === 0 ? 0 : sectionTops[i] - headerOffset;
    const clamped = Math.min(max, Math.max(previous, Number.isFinite(raw) ? raw : previous));
    out[i] = clamped;
    previous = clamped;
  }
  return out;
}

export type ChapterLocation = { index: number; progress: number };

/**
 * Which chapter a scroll position lies in and how far through it (0–1). Chapter i spans from its
 * boundary to the next one; the last chapter runs to the end of the page. Writes into `out` (the
 * spine calls this on every scroll update; it allocates nothing).
 */
export function locateChapter(scroll: number, boundaries: readonly number[], max: number, out: ChapterLocation): ChapterLocation {
  const n = boundaries.length;
  if (n === 0) {
    out.index = -1;
    out.progress = 0;
    return out;
  }
  const s = scroll >= max - END_TOLERANCE_PX ? max : Math.max(0, scroll);
  let index = 0;
  for (let i = n - 1; i > 0; i--) {
    if (s >= boundaries[i] - BOUNDARY_TOLERANCE_PX) {
      index = i;
      break;
    }
  }
  const start = boundaries[index];
  const end = index + 1 < n ? boundaries[index + 1] : max;
  const length = end - start;
  out.index = index;
  out.progress = length > 0 ? Math.min(1, Math.max(0, (s - start) / length)) : 1;
  return out;
}
