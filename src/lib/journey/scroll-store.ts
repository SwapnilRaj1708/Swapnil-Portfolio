import { createStore } from "zustand/vanilla";
import { CHAPTERS, type ChapterId } from "./chapters";
import type { ScrollMode } from "./scroll-mode";

/**
 * The one source of truth for scroll (STANDARDS.md §1), beside the tier store (store.ts). Vanilla
 * zustand: the frame loop reads it with `scrollStore.getState()` and never causes a React render.
 * Written only by the scroll spine (src/components/journey/scroll/scroll-spine.tsx), which runs on
 * the home page in the non-static tiers. Everywhere else it stays inactive.
 *
 *   progress         0–1 over the whole page (exactly 0 at the top, 1 at the bottom)
 *   chapter          the registry id of the chapter the scroll position lies in
 *   chapterProgress  0–1 within that chapter
 *   epoch            bumped when the scroll position was set rather than travelled (the spine
 *                    started on a page: a cold load mid-page, a deep link, a return from another
 *                    page): the camera then snaps to its pose instead of easing there.
 *
 * React components that need the chapter (the navigation) do not import this store: it is part of
 * the lazy 3D chunk. The spine mirrors the chapter's section to the document instead
 * (chapter-bridge.ts), and the navigation subscribes to that.
 */

export type ScrollState = {
  active: boolean;
  mode: ScrollMode | null;
  progress: number;
  chapterIndex: number;
  chapter: ChapterId | null;
  chapterProgress: number;
  epoch: number;
};

const initial: ScrollState = { active: false, mode: null, progress: 0, chapterIndex: -1, chapter: null, chapterProgress: 0, epoch: 0 };

export const scrollStore = createStore<ScrollState>()(() => initial);

/** The spine started on a page with chapters (a new epoch: the camera snaps). */
export function activateScroll(mode: ScrollMode): void {
  scrollStore.setState((s) => ({ active: true, mode, epoch: s.epoch + 1 }));
}

/** The spine stopped (another page, the static tier). */
export function deactivateScroll(): void {
  scrollStore.setState((s) => ({ ...initial, epoch: s.epoch }));
}

/** A new scroll position; writes only when something changed. */
export function setScrollPosition(progress: number, chapterIndex: number, chapterProgress: number): void {
  const s = scrollStore.getState();
  if (s.progress === progress && s.chapterIndex === chapterIndex && s.chapterProgress === chapterProgress) return;
  scrollStore.setState({
    progress,
    chapterIndex,
    chapter: chapterIndex >= 0 ? (CHAPTERS[chapterIndex]?.id ?? null) : null,
    chapterProgress,
  });
}

/** For unit tests. */
export function resetScrollStoreForTests(): void {
  scrollStore.setState(initial, true);
}
