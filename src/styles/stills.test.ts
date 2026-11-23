import { describe, expect, it } from "vitest";
import { type Scrim, scrimAlpha, scrimGradient, scrimGradientLiteral, STILL_LAYOUT } from "./stills";

const scrim: Scrim = {
  from: "bottom",
  stops: [
    [0, 0.8],
    [0.5, 0.4],
    [0.75, 0],
  ],
};

describe("scrims", () => {
  it("draws a gradient of the background token only (no raw colour)", () => {
    expect(scrimGradient(scrim)).toBe(
      "linear-gradient(to top, color-mix(in srgb, var(--color-background) 80%, transparent) 0%, " +
        "color-mix(in srgb, var(--color-background) 40%, transparent) 50%, " +
        "color-mix(in srgb, var(--color-background) 0%, transparent) 75%)",
    );
    expect(scrimGradientLiteral({ from: "left", stops: [[0, 0.5]] }, "#07090c")).toBe("linear-gradient(to right, rgba(7, 9, 12, 0.5) 0%)");
  });

  it("gives the alpha a browser draws at any point, linear between stops", () => {
    expect(scrimAlpha(scrim, 0.3, 1)).toBeCloseTo(0.8); // bottom edge
    expect(scrimAlpha(scrim, 0.3, 0.75)).toBeCloseTo(0.6); // halfway between the first two stops
    expect(scrimAlpha(scrim, 0.3, 0.5)).toBeCloseTo(0.4);
    expect(scrimAlpha(scrim, 0.3, 0.1)).toBe(0); // past the last stop
    expect(scrimAlpha({ from: "right", stops: [[0, 0.4], [0.5, 0]] }, 0.75, 0)).toBeCloseTo(0.2);
  });

  it("covers both crops of every chapter, each scrim with ascending stops and alphas in 0–1", () => {
    for (const [chapter, crops] of Object.entries(STILL_LAYOUT)) {
      for (const [crop, layout] of Object.entries(crops)) {
        expect(layout.scrims.length, `${chapter} ${crop}`).toBeGreaterThan(0);
        for (const s of layout.scrims) {
          const positions = s.stops.map(([p]) => p);
          expect(positions, `${chapter} ${crop}`).toEqual([...positions].sort((a, b) => a - b));
          for (const [p, a] of s.stops) {
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThanOrEqual(1);
            expect(a).toBeGreaterThanOrEqual(0);
            expect(a).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});
