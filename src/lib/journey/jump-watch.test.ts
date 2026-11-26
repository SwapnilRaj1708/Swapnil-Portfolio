import { describe, expect, it } from "vitest";
import { createJumpWatch, jumpTuning, watchJump } from "./jump-watch";

/** Feeds positions one frame apart (ms) and returns the state after each. */
function run(start: number, target: number, positions: number[], frameMs = 16) {
  const watch = createJumpWatch(start, 0);
  return positions.map((y, i) => watchJump(watch, y, target, (i + 1) * frameMs));
}

describe("jump watch: when a nav jump has landed", () => {
  it("lands only once the page is at the target and has stopped moving", () => {
    const states = run(0, 2039, [120, 950, 1700, 2000, 2037, 2039, 2039]);
    expect(states).toEqual(["moving", "moving", "moving", "moving", "moving", "moving", "landed"]);
  });

  it("treats a whole pixel next to a fractional target as the target", () => {
    expect(run(0, 7312.5, [7000, 7313, 7313]).at(-1)).toBe("landed");
    expect(run(0, 7312.5, [7000, 7312, 7312]).at(-1)).toBe("landed");
    expect(run(0, 7312.5, [7000, 7311, 7311]).at(-1)).not.toBe("landed");
  });

  it("does not land at the start: standing still away from the target is never a landing (the CI failure)", () => {
    // The jump begins where an earlier instant scroll left the page (1589, aiming for 837); the
    // smooth scroll has not moved yet. Whatever events arrive, the watch says "moving".
    const states = run(1589, 837, [1589, 1589]);
    expect(states).toEqual(["moving", "moving"]);
  });

  it("lands at once when the jump starts at its target", () => {
    expect(run(837, 837, [837])).toEqual(["landed"]);
  });

  it("reports a stall only after enough still frames and enough time", () => {
    // Moving, then stopped short of the target: frames 16 ms apart need 300 ms of standing still.
    const positions = [900, 1000, ...Array.from({ length: 25 }, () => 1000)];
    const states = run(837, 2039, positions);
    const first = states.indexOf("stalled");
    expect(first).toBeGreaterThan(0);
    // Stopped at the 2nd frame (32 ms); a stall needs ≥ stallMs after it.
    expect((first + 1) * 16 - 32).toBeGreaterThanOrEqual(jumpTuning.stallMs);
    expect(states.slice(0, first).every((s) => s === "moving")).toBe(true);
  });

  it("needs still frames as well as time: one long frame is not a stall", () => {
    const watch = createJumpWatch(837, 0);
    expect(watchJump(watch, 900, 2039, 16)).toBe("moving");
    expect(watchJump(watch, 900, 2039, 600)).toBe("moving"); // one 584 ms frame
    expect(watchJump(watch, 900, 2039, 620)).toBe("moving");
    expect(watchJump(watch, 900, 2039, 640)).toBe("stalled");
  });

  it("starts over when the page moves again", () => {
    const watch = createJumpWatch(0, 0);
    for (let t = 16; t <= 400; t += 16) watchJump(watch, 500, 2039, t);
    expect(watchJump(watch, 500, 2039, 416)).toBe("stalled");
    expect(watchJump(watch, 520, 2039, 432)).toBe("moving");
    expect(watch.stillFrames).toBe(0);
    expect(watch.stillSince).toBe(432);
  });
});
