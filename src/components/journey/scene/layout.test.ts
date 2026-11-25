import { describe, expect, it } from "vitest";
import { placeTestObject } from "./layout";

// The test object stays out of the hero's text-safe area (BRIEF.md §4): the left 40 % of wide
// frames, the top 40 % of portrait ones – with extra room on the wide side, where the hero copy
// column can reach about 52 % of a 4:3 window. Fractions of the viewport, from its left / top.
function span(viewport: { width: number; height: number }) {
  const p = placeTestObject(viewport);
  return {
    left: 0.5 + (p.x - p.radius) / viewport.width,
    right: 0.5 + (p.x + p.radius) / viewport.width,
    top: 0.5 - (p.y + p.radius) / viewport.height,
    bottom: 0.5 - (p.y - p.radius) / viewport.height,
  };
}

describe("where the test object sits", () => {
  it.each([
    [16, 9],
    [16, 10],
    [4, 3],
    [21, 9],
    [844, 390],
  ])("wide %i:%i – right of 55 % of the width, inside the frame", (w, h) => {
    const s = span({ width: w, height: h });
    expect(s.left).toBeGreaterThanOrEqual(0.55 - 1e-9);
    expect(s.right).toBeLessThanOrEqual(0.95 + 1e-9);
    expect(s.top).toBeGreaterThanOrEqual(0.2 - 1e-9);
    expect(s.bottom).toBeLessThanOrEqual(0.8 + 1e-9);
  });

  it.each([
    [390, 844],
    [360, 780],
    [768, 1024],
    [9, 16],
  ])("portrait %i×%i – below 55 % of the height", (w, h) => {
    const s = span({ width: w, height: h });
    expect(s.top).toBeGreaterThanOrEqual(0.55 - 1e-9);
    expect(s.bottom).toBeLessThanOrEqual(0.85 + 1e-9);
    expect(s.left).toBeGreaterThanOrEqual(0.2 - 1e-9);
    expect(s.right).toBeLessThanOrEqual(0.8 + 1e-9);
  });
});
