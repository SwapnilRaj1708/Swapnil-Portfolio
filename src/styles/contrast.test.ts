import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, mixSrgb } from "@/lib/contrast";
import { parseColorTokens } from "@/lib/design-tokens";
import { CONTRAST_PAIRS, MIN_RATIO } from "./contrast-pairs";

// Tokens are read from the stylesheet itself – the one source.
const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");
const colors = parseColorTokens(css);

describe("colour tokens", () => {
  it("match the locked look bible (BRIEF.md §4, Hex (DOM))", () => {
    expect(colors).toMatchObject({
      background: "#07090c",
      surface: "#12161c",
      "surface-raised": "#1c222a",
      "accent-trace": "#e08a3c",
      "accent-signal": "#cff6ff",
      text: "#e8ecf1",
      "text-muted": "#8e97a3",
    });
  });

  it("derive tints only by color-mix of palette tokens", () => {
    // parseColorTokens throws on anything else; this asserts one known mix.
    expect(colors.line).toBe(mixSrgb(colors.text, 12, colors.background));
  });
});

describe("WCAG contrast", () => {
  it("computes the ratios the look bible states", () => {
    expect(contrastRatio(colors.text, colors.background)).toBeCloseTo(16.8, 1);
    expect(contrastRatio(colors["text-muted"], colors.background)).toBeCloseTo(6.75, 1);
    expect(contrastRatio(colors["accent-trace"], colors.background)).toBeCloseTo(7.47, 1);
  });

  it.each(CONTRAST_PAIRS.map((p) => [`${p.fg} on ${p.bg} (${p.kind}: ${p.use})`, p] as const))(
    "%s meets its minimum",
    (_label, pair) => {
      expect(colors[pair.fg], `unknown token ${pair.fg}`).toBeDefined();
      expect(colors[pair.bg], `unknown token ${pair.bg}`).toBeDefined();
      const ratio = contrastRatio(colors[pair.fg], colors[pair.bg]);
      expect(ratio).toBeGreaterThanOrEqual(MIN_RATIO[pair.kind]);
    },
  );
});
