import { describe, expect, it } from "vitest";
import { BOUNDARY_TOLERANCE_PX, chapterBoundaries, END_TOLERANCE_PX, locateChapter, maxScrollOf, scrollToProgress, type ChapterLocation } from "./scroll-math";

// PF-008: scroll position → progress, and section offsets → chapter boundaries → chapter.

describe("maxScrollOf", () => {
  it("is the document height minus the viewport height", () => {
    expect(maxScrollOf(5000, 900)).toBe(4100);
  });
  it("is 0 when the page does not scroll (or the numbers are not usable)", () => {
    expect(maxScrollOf(900, 900)).toBe(0);
    expect(maxScrollOf(500, 900)).toBe(0);
    expect(maxScrollOf(0, 0)).toBe(0);
    expect(maxScrollOf(Number.NaN, 900)).toBe(0);
  });
});

describe("scrollToProgress", () => {
  it("is exactly 0 at the top and exactly 1 at the bottom", () => {
    expect(scrollToProgress(0, 4100)).toBe(0);
    expect(scrollToProgress(4100, 4100)).toBe(1);
  });
  it("is linear in between", () => {
    expect(scrollToProgress(1025, 4100)).toBe(0.25);
    expect(scrollToProgress(2050, 4100)).toBe(0.5);
  });
  it("clamps: overscroll above the top or below the bottom stays 0 / 1", () => {
    expect(scrollToProgress(-40, 4100)).toBe(0);
    expect(scrollToProgress(4300, 4100)).toBe(1);
  });
  it("is 1 within half a pixel of a fractional end (the browser may stop just short)", () => {
    expect(scrollToProgress(4100.4 - END_TOLERANCE_PX, 4100.4)).toBe(1);
    expect(scrollToProgress(4099, 4100.4)).toBeLessThan(1);
  });
  it("is 0 on a page that does not scroll (zero height, or no scroll at all)", () => {
    expect(scrollToProgress(0, 0)).toBe(0);
    expect(scrollToProgress(10, 0)).toBe(0);
    expect(scrollToProgress(Number.NaN, 4100)).toBe(0);
  });
});

describe("chapterBoundaries", () => {
  // Six sections: the hero right below a 64 px header, then five more.
  const tops = [64, 900, 2100, 3300, 5200, 6400];

  it("starts each chapter where its section's top meets the header (the anchor landing), the first at 0", () => {
    expect(chapterBoundaries(tops, 64, 9000)).toEqual([0, 836, 2036, 3236, 5136, 6336]);
  });

  it("clamps to the page end and keeps the sections' order", () => {
    expect(chapterBoundaries(tops, 64, 5500)).toEqual([0, 836, 2036, 3236, 5136, 5500]);
    expect(chapterBoundaries([64, 900, 800], 64, 9000)).toEqual([0, 836, 836]);
  });

  it("follows extra scroll length (sections pushed down by extra height before them)", () => {
    const extra = 900; // one viewport of extra height at the end of the bus section
    const pushed = tops.map((t, i) => (i >= 2 ? t + extra : t));
    expect(chapterBoundaries(pushed, 64, 9900)).toEqual([0, 836, 2936, 4136, 6036, 7236]);
  });

  it("writes into the array it is given (no allocation on refresh)", () => {
    const out: number[] = [];
    expect(chapterBoundaries(tops, 64, 9000, out)).toBe(out);
  });
});

describe("locateChapter", () => {
  const boundaries = [0, 836, 2036, 3236, 5136, 6336];
  const max = 7000;
  const at = (scroll: number) => locateChapter(scroll, boundaries, max, { index: 0, progress: 0 } as ChapterLocation);

  it("puts the top in the first chapter at 0", () => {
    expect(at(0)).toEqual({ index: 0, progress: 0 });
  });

  it("starts a chapter exactly at its boundary (and within 1 px before it)", () => {
    expect(at(836)).toEqual({ index: 1, progress: 0 });
    expect(at(836 - BOUNDARY_TOLERANCE_PX)).toEqual({ index: 1, progress: 0 });
    expect(at(834).index).toBe(0);
  });

  it("measures progress within the chapter", () => {
    expect(at(2036 + 600)).toEqual({ index: 2, progress: 0.5 });
    expect(at(835)).toMatchObject({ index: 1, progress: 0 });
  });

  it("runs the last chapter to the page end", () => {
    expect(at(max)).toEqual({ index: 5, progress: 1 });
    expect(at(6336 + 332)).toEqual({ index: 5, progress: 0.5 });
    expect(at(max + 50)).toEqual({ index: 5, progress: 1 });
  });

  it("handles a zero-length last chapter at the page end", () => {
    expect(locateChapter(5500, [0, 836, 2036, 3236, 5136, 5500], 5500, { index: 0, progress: 0 })).toEqual({ index: 5, progress: 1 });
  });

  it("has no chapter without boundaries", () => {
    expect(locateChapter(100, [], 1000, { index: 0, progress: 0 })).toEqual({ index: -1, progress: 0 });
  });

  it("writes into the object it is given", () => {
    const out = { index: 0, progress: 0 };
    expect(locateChapter(3000, boundaries, max, out)).toBe(out);
  });
});
