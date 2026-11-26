import { describe, expect, it } from "vitest";
import { clipTimeForFrame, frameAt, parsePathTiming, resolveChapterFrames, type PathTiming } from "./path-mapping";

// PF-008: CH_ markers → the frames each chapter scrubs, and frames → clip time.

const IDS = ["port", "bus", "memory", "array", "core", "uplink"];
const timing = (markers: Record<string, number>, over: Partial<PathTiming> = {}): PathTiming => ({ fps: 30, firstFrame: 1, lastFrame: 361, markers, ...over });
const ALL = { CH_port: 1, CH_bus: 61, CH_memory: 121, CH_array: 200, CH_core: 260, CH_uplink: 320 };

describe("resolveChapterFrames", () => {
  it("uses the markers when all are there and in order", () => {
    const frames = resolveChapterFrames(IDS, timing(ALL));
    expect(frames.problem).toBeNull();
    expect(frames.starts).toEqual([1, 61, 121, 200, 260, 320]);
    expect(frames.end).toBe(361);
  });

  it("spaces the chapters evenly when a marker is missing, and says which", () => {
    const { CH_core: _drop, ...rest } = ALL; // eslint-disable-line @typescript-eslint/no-unused-vars
    const frames = resolveChapterFrames(IDS, timing(rest));
    expect(frames.problem?.kind).toBe("missing");
    expect(frames.problem?.message).toContain("CH_core");
    expect(frames.starts).toEqual([1, 61, 121, 181, 241, 301]);
  });

  it("spaces them evenly when markers are out of chapter order", () => {
    const frames = resolveChapterFrames(IDS, timing({ ...ALL, CH_memory: 250 }));
    expect(frames.problem?.kind).toBe("out-of-order");
    expect(frames.starts).toEqual([1, 61, 121, 181, 241, 301]);
  });

  it("spaces them evenly when a marker lies outside the frame range", () => {
    const frames = resolveChapterFrames(IDS, timing({ ...ALL, CH_uplink: 400 }));
    expect(frames.problem?.kind).toBe("out-of-order");
    expect(frames.problem?.message).toContain("CH_uplink");
  });

  it("refuses a range it cannot play (no fps, last before first)", () => {
    expect(resolveChapterFrames(IDS, timing(ALL, { fps: 0 })).problem?.kind).toBe("bad-range");
    expect(resolveChapterFrames(IDS, timing(ALL, { lastFrame: 1 })).problem?.kind).toBe("bad-range");
  });

  it("ignores markers that are not chapters (other timeline markers)", () => {
    expect(resolveChapterFrames(IDS, timing({ ...ALL, HOLD_array: 230 })).problem).toBeNull();
  });
});

describe("frameAt", () => {
  const frames = resolveChapterFrames(IDS, timing(ALL));

  it("reaches each chapter's marker exactly at the chapter's start", () => {
    IDS.forEach((_, i) => expect(frameAt(frames, i, 0)).toBe(frames.starts[i]));
  });

  it("maps chapter progress linearly to the next marker; the last chapter runs to lastFrame", () => {
    expect(frameAt(frames, 0, 0.5)).toBe(31);
    expect(frameAt(frames, 2, 1)).toBe(200);
    expect(frameAt(frames, 3, 0.25)).toBe(215);
    expect(frameAt(frames, 5, 1)).toBe(361);
    expect(frameAt(frames, 5, 0.5)).toBe(340.5);
  });

  it("clamps the chapter index and the progress", () => {
    expect(frameAt(frames, -1, 0)).toBe(1);
    expect(frameAt(frames, 9, 2)).toBe(361);
    expect(frameAt(frames, 1, -1)).toBe(61);
  });
});

describe("clipTimeForFrame", () => {
  it("counts from the clip's first key, whatever time the exporter gave it", () => {
    const frames = { firstFrame: 1, fps: 30 };
    expect(clipTimeForFrame(1, frames, 0)).toBe(0);
    expect(clipTimeForFrame(31, frames, 0)).toBe(1);
    // An exporter that keeps Blender's frame numbers: frame 1 at 1/30 s.
    expect(clipTimeForFrame(31, frames, 1 / 30)).toBeCloseTo(1 + 1 / 30, 10);
  });
});

describe("parsePathTiming", () => {
  it("reads the contract's fields and drops non-numeric markers", () => {
    expect(parsePathTiming({ fps: 30, firstFrame: 1, lastFrame: 361, markers: { CH_port: 1, note: "x" } })).toEqual({
      fps: 30,
      firstFrame: 1,
      lastFrame: 361,
      markers: { CH_port: 1 },
    });
  });
  it("throws on a file of another shape", () => {
    expect(() => parsePathTiming({ fps: 30 })).toThrow(/world-path\.json/);
    expect(() => parsePathTiming(null)).toThrow();
  });
});
