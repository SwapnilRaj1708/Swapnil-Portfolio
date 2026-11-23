import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkContentFiles, webpSize } from "./check-files";
import { formatYearMonth } from "./format";
import { content } from "./index";

const PUBLIC = path.resolve(__dirname, "../../public");

describe("content files (the build-time check in next.config.ts)", () => {
  it("finds every media file and the resume PDF, at the stated pixel size", () => {
    expect(checkContentFiles(content, PUBLIC)).toEqual([]);
  });

  it("reports a missing file", () => {
    const broken = structuredClone(content);
    broken.projects[0].media[0].src = "/media/projects/twizzr/missing.webp";
    expect(checkContentFiles(broken, PUBLIC)).toEqual([
      'projects "twizzr" media[0] (/media/projects/twizzr/missing.webp): file not found in public/',
    ]);
  });

  it("reports a size that does not match the file", () => {
    const broken = structuredClone(content);
    broken.projects[0].media[0].width = 1200;
    expect(checkContentFiles(broken, PUBLIC)[0]).toContain("the file is 1440×900 px but the data says 1200×900");
  });

  it("reads the size of a WebP file", () => {
    expect(webpSize(readFileSync(path.join(PUBLIC, "media/projects/twizzr/home.webp")))).toEqual({ width: 1440, height: 900 });
    expect(webpSize(Buffer.from("not a webp file at all, really not"))).toBeNull();
  });

  it("keeps every stand-in image at 250 KB or less", () => {
    for (const p of content.projects) {
      for (const m of p.media.filter((x) => x.provisional)) {
        expect(readFileSync(path.join(PUBLIC, m.src)).length, m.src).toBeLessThanOrEqual(250_000);
      }
    }
  });
});

describe("formatYearMonth", () => {
  it("formats YYYY-MM as a short month and year", () => {
    expect(formatYearMonth("2025-04")).toBe("Apr 2025");
    expect(formatYearMonth("2020-10")).toBe("Oct 2020");
  });
});
