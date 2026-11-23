import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// STANDARDS.md §9: components use design tokens only – no raw colour, spacing or timing values.
// Scans every component and page source for the usual ways a raw value sneaks in.

const SRC = path.resolve(__dirname, "..");
const DIRS = ["components", "app"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [full] : [];
  });
}

const RULES: [string, RegExp][] = [
  ["hex colour", /#[0-9a-f]{3,8}\b(?![-\w])/i],
  ["colour function", /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/],
  ["arbitrary value with a unit", /\[[^\]\s]*\d(?:px|rem|em|ms|s|vh|vw|svh|dvh|%)[^\]\s]*\]/],
  ["numeric duration or delay class", /\b(?:duration|delay)-\d+\b/],
  ["numeric text size", /\btext-\[\d/],
];

const files = DIRS.flatMap((d) => sourceFiles(path.join(SRC, d)));

describe("tokens only", () => {
  it("finds component and page files to check", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => [path.relative(SRC, f).replaceAll("\\", "/"), f]))(
    "%s uses no raw colour, spacing or timing values",
    (_name, file) => {
      const lines = readFileSync(file, "utf8").split("\n");
      const problems: string[] = [];
      lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments
        for (const [what, re] of RULES) {
          if (re.test(line)) problems.push(`line ${i + 1}: ${what}: ${line.trim()}`);
        }
      });
      expect(problems).toEqual([]);
    },
  );
});
