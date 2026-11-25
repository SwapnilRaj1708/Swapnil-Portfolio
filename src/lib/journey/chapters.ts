/**
 * The chapter registry (STANDARDS.md §1: chapters are modules registered in one registry). One
 * entry per scroll chapter, in the journey's order (BRIEF.md §3, D-24): the home page's sections
 * from top to bottom.
 *
 *   id          the chapter (asset name, BRIEF §3)
 *   sectionId   the home section it belongs to (its DOM id; the navigation's anchors)
 *   extraScroll extra scroll length in viewport heights, added below the section's content as extra
 *               height – only in the non-static tiers (the static tier and the production
 *               deployment keep the stage 1 page exactly). 0 by default; tuned in the dev panel
 *               (PF-010 bakes the owner's values in here)
 *   marker      the path marker the camera reaches when the section starts (`CH_<id>` in
 *               world-path.json, STANDARDS §6)
 *   tuning      the chapter's own tunables (scene values; each chapter's item fills its object)
 *
 * Boot (PF-012) is not a scroll chapter: it plays before the page is scrolled and has no section,
 * so it is not in this list.
 *
 * Chapter boundaries are not stored here: they come from the measured DOM sections (scroll-math.ts
 * `chapterBoundaries`), so the camera and the DOM can never drift apart.
 *
 * `extraScroll` and `tuning` are mutable on purpose: the dev tuning panel writes into them and the
 * frame loop reads them directly (no React state). The other fields never change.
 */

export const CHAPTER_IDS = ["port", "bus", "memory", "array", "core", "uplink"] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

export type ChapterMarker = `CH_${ChapterId}`;

export type ChapterEntry = {
  readonly id: ChapterId;
  readonly sectionId: string;
  readonly marker: ChapterMarker;
  /** Extra scroll length in viewport heights (non-static tiers only). */
  extraScroll: number;
  /** The chapter's own tunables, filled in by its item (numbers only, so the panel can export them). */
  tuning: Record<string, number>;
};

function entry(id: ChapterId, sectionId: string): ChapterEntry {
  return { id, sectionId, marker: `CH_${id}`, extraScroll: 0, tuning: {} };
}

export const CHAPTERS: readonly ChapterEntry[] = [
  entry("port", "top"),
  entry("bus", "about"),
  entry("memory", "experience"),
  entry("array", "work"),
  entry("core", "skills"),
  entry("uplink", "contact"),
];

/** The registry index of a chapter id, or -1. */
export function chapterIndex(id: string): number {
  return CHAPTERS.findIndex((c) => c.id === id);
}

/** The registry index of the chapter whose section has this DOM id, or -1. */
export function chapterIndexOfSection(sectionId: string): number {
  return CHAPTERS.findIndex((c) => c.sectionId === sectionId);
}

/** The largest extra scroll length the panel offers (viewport heights). */
export const MAX_EXTRA_SCROLL = 4;
