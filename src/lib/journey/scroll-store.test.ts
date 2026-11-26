import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAPTER_EVENT, CHAPTER_SECTION_ATTRIBUTE, publishChapterSection } from "./chapter-bridge";
import { activateScroll, deactivateScroll, resetScrollStoreForTests, scrollStore, setScrollPosition } from "./scroll-store";

// PF-008: the scroll store the frame loop reads, and the chapter mirrored for the navigation.

afterEach(() => {
  resetScrollStoreForTests();
  document.documentElement.removeAttribute(CHAPTER_SECTION_ATTRIBUTE);
});

describe("scroll store", () => {
  it("starts inactive, with no chapter", () => {
    expect(scrollStore.getState()).toMatchObject({ active: false, chapter: null, chapterIndex: -1, progress: 0 });
  });

  it("names the chapter from the registry index", () => {
    activateScroll("lenis");
    setScrollPosition(0.5, 3, 0.25);
    expect(scrollStore.getState()).toMatchObject({ active: true, mode: "lenis", progress: 0.5, chapter: "array", chapterIndex: 3, chapterProgress: 0.25 });
  });

  it("writes (and notifies) only when something changed", () => {
    const listener = vi.fn();
    const unsubscribe = scrollStore.subscribe(listener);
    setScrollPosition(0.1, 0, 0.2);
    setScrollPosition(0.1, 0, 0.2);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("bumps the epoch on every start (the camera snaps instead of easing) and keeps it when stopped", () => {
    activateScroll("native");
    const first = scrollStore.getState().epoch;
    deactivateScroll();
    expect(scrollStore.getState()).toMatchObject({ active: false, epoch: first, chapter: null });
    activateScroll("native");
    expect(scrollStore.getState().epoch).toBe(first + 1);
  });
});

describe("chapter bridge", () => {
  it("mirrors the section id onto <html> and fires one event per change", () => {
    const listener = vi.fn();
    window.addEventListener(CHAPTER_EVENT, listener);
    publishChapterSection("about");
    publishChapterSection("about");
    expect(document.documentElement.getAttribute(CHAPTER_SECTION_ATTRIBUTE)).toBe("about");
    expect(listener).toHaveBeenCalledTimes(1);
    publishChapterSection(null);
    expect(document.documentElement.hasAttribute(CHAPTER_SECTION_ATTRIBUTE)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    window.removeEventListener(CHAPTER_EVENT, listener);
  });
});
