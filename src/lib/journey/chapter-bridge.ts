/**
 * The current chapter, for the navigation (PF-008).
 *
 * The scroll store (scroll-store.ts) lives in the lazy 3D chunk; the navigation is in every page's
 * first-load JS, and on the production deployment (D-39) it must not carry any of the journey's
 * code. So the spine mirrors the current chapter's section id onto the document and announces each
 * change with an event; the navigation's hook (`useJourneyChapter` in
 * src/components/journey/gate.tsx, compiled only where the 3D layer is built in) reads it with
 * `useSyncExternalStore` – it re-renders on a chapter change, never on scroll.
 *
 *   <html data-journey-section="about">   the current chapter's section id; absent = no chapter
 *                                         (static tier, another page, production)
 *   window event "journey:chapter"        fired after every change
 *
 * gate.tsx repeats these two names as literals (it may not import this module);
 * src/components/layout/site-nav.test.tsx publishes through this module and checks the
 * navigation follows, so the two cannot drift apart.
 */

export const CHAPTER_SECTION_ATTRIBUTE = "data-journey-section";
export const CHAPTER_EVENT = "journey:chapter";

/** Publishes the current chapter's section id (or null: none). */
export function publishChapterSection(sectionId: string | null): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const before = root.getAttribute(CHAPTER_SECTION_ATTRIBUTE);
  if (before === sectionId) return;
  if (sectionId === null) root.removeAttribute(CHAPTER_SECTION_ATTRIBUTE);
  else root.setAttribute(CHAPTER_SECTION_ATTRIBUTE, sectionId);
  window.dispatchEvent(new Event(CHAPTER_EVENT));
}
