import { describe, expect, it } from "vitest";
import { cameraDamped, chooseScrollMode, parseSmoothOverride } from "./scroll-mode";

// PF-008: Lenis by default on fine pointers, and the `?smooth=off` comparison override.

describe("?smooth=off", () => {
  it("is honoured only where the overrides are allowed (never on the production deployment)", () => {
    expect(parseSmoothOverride("?smooth=off", true)).toBe("off");
    expect(parseSmoothOverride("?smooth=off", false)).toBeNull();
    expect(parseSmoothOverride("?tier=high&smooth=off", true)).toBe("off");
  });
  it("ignores anything else", () => {
    expect(parseSmoothOverride("", true)).toBeNull();
    expect(parseSmoothOverride("?smooth=on", true)).toBeNull();
    expect(parseSmoothOverride("?smooth=OFF", true)).toBeNull();
  });
});

describe("scroll mode", () => {
  it("smooths wheel input with Lenis on a fine pointer; the camera then follows directly", () => {
    const mode = chooseScrollMode({ smoothOverride: null, finePointer: true });
    expect(mode).toBe("lenis");
    expect(cameraDamped(mode)).toBe(false);
  });
  it("keeps native scrolling on touch-first devices, with the camera eased", () => {
    const mode = chooseScrollMode({ smoothOverride: null, finePointer: false });
    expect(mode).toBe("native");
    expect(cameraDamped(mode)).toBe(true);
  });
  it("turns Lenis off everywhere with ?smooth=off", () => {
    expect(chooseScrollMode({ smoothOverride: "off", finePointer: true })).toBe("native");
  });
});
