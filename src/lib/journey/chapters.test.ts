import { describe, expect, it } from "vitest";
import { homeSections } from "@/content/data/site";
import { CHAPTER_IDS, CHAPTERS, chapterIndex, chapterIndexOfSection } from "./chapters";

// PF-008: the chapter registry follows BRIEF.md §3 (D-24) and the home page's sections.

describe("chapter registry", () => {
  it("lists the scroll chapters in BRIEF §3 order (D-24), boot excluded", () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual(["port", "bus", "memory", "array", "core", "uplink"]);
    expect(CHAPTER_IDS).toEqual(CHAPTERS.map((c) => c.id));
  });

  it("names each chapter's section id as BRIEF §3 does", () => {
    expect(CHAPTERS.map((c) => [c.id, c.sectionId])).toEqual([
      ["port", "top"],
      ["bus", "about"],
      ["memory", "experience"],
      ["array", "work"],
      ["core", "skills"],
      ["uplink", "contact"],
    ]);
  });

  it("matches the home page's sections (content) one to one, in the same order", () => {
    expect(CHAPTERS.map((c) => [c.id, c.sectionId])).toEqual(homeSections.map((s) => [s.chapter, s.sectionId]));
  });

  it("gives each chapter its path marker CH_<id>, no extra scroll by default and a tuning object", () => {
    for (const c of CHAPTERS) {
      expect(c.marker).toBe(`CH_${c.id}`);
      expect(c.extraScroll).toBe(0);
      expect(c.tuning).toEqual({});
    }
  });

  it("finds chapters by id and by section id", () => {
    expect(chapterIndex("array")).toBe(3);
    expect(chapterIndexOfSection("contact")).toBe(5);
    expect(chapterIndexOfSection("main")).toBe(-1);
  });
});
