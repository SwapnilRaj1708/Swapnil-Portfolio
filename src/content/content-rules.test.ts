import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { projects } from "./index";

// Content rules from WORKFLOW.md §6 and BRIEF.md §8 / §9, checked over every text file of the
// repo that ships or documents the site.
//  - Twizzr is "hyperlocal commerce", never the other framing (the pattern is built from parts
//    so this file does not contain the phrase itself).
//  - No phone number anywhere (D-27: the only place one may appear is inside the resume PDF,
//    which is binary and not scanned here).

const ROOT = path.resolve(__dirname, "../..");
const SCANNED = ["src", "public", "docs", "scripts", "e2e", "CLAUDE.md", "README.md", "CONTENT-LICENSE.md"];
const TEXT = /\.(ts|tsx|mjs|js|json|md|css|txt|svg|html|xml|yml|yaml)$/i;
// `decoders`: public/decoders/, three.js's own transcoders copied before each build (PF-009,
// git-ignored, never ours – the Basis transcoder holds a ten-digit 32-bit constant).
const SKIP_DIRS = new Set(["node_modules", "vendor", ".next", "decoders"]);

function textFiles(target: string): string[] {
  const full = path.join(ROOT, target);
  const stat = statSync(full, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isFile()) return TEXT.test(full) ? [full] : [];
  return readdirSync(full, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? SKIP_DIRS.has(e.name)
        ? []
        : textFiles(path.join(target, e.name))
      : TEXT.test(e.name)
        ? [path.join(full, e.name)]
        : [],
  );
}

const files = SCANNED.flatMap(textFiles);
const rel = (f: string) => path.relative(ROOT, f).replaceAll("\\", "/");

const BANNED_FRAMING = new RegExp(["quick", "commerce"].join("[\\s-]?"), "i");

// A phone number: 10 or more digits in a row, optionally led by + and split by single spaces,
// dots or hyphens. Dates (2026-11-23), sizes and versions have fewer digits. The samples below
// are made-up and built from parts, so this file holds no number-shaped text itself.
const PHONE = /(?<![\w./#-])\+?\d(?:[ .-]?\d){9,}(?![\w])/;

describe("content rules", () => {
  it("scans the repo's text files", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it("never frames Twizzr as anything but hyperlocal commerce", () => {
    const hits = files.filter((f) => BANNED_FRAMING.test(readFileSync(f, "utf8"))).map(rel);
    expect(hits).toEqual([]);
    expect(projects.find((p) => p.slug === "twizzr")?.problem).toContain("hyperlocal commerce");
  });

  it("contains no phone number in src/, public/ (outside the PDF), docs or scripts", () => {
    const hits: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const m = PHONE.exec(line);
          if (m) hits.push(`${rel(f)}:${i + 1}: ${m[0]}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it("the phone pattern catches the usual ways of writing a number", () => {
    const a = "98765";
    const b = "43210";
    for (const sample of [`+91 ${a} ${b}`, a + b, `${a}-${b}`, `+91${a}${b}`, `${a}.${b}`]) {
      expect(PHONE.test(sample), sample).toBe(true);
    }
    for (const sample of ["2026-11-23", "1440×900", "16.80:1", "v24.19.0", "e739aff9…3eb47f", "42 588 B"]) {
      expect(PHONE.test(sample), sample).toBe(false);
    }
  });
});
