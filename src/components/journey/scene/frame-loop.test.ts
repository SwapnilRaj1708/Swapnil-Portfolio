import { describe, expect, it } from "vitest";
import { FrameEvent, FrameLoop } from "./frame-loop";

describe("the frame loop's bookkeeping", () => {
  it("reports the first frame once", () => {
    const loop = new FrameLoop("high");
    expect(loop.frame(16.7, 2, 0, false) & FrameEvent.FirstFrame).toBeTruthy();
    expect(loop.frame(16.7, 2, 16.7, false) & FrameEvent.FirstFrame).toBeFalsy();
  });

  it("reports a downgrade when frames stay slow, but never while the tier is pinned (?tier=)", () => {
    const pinned = new FrameLoop("high");
    const free = new FrameLoop("high");
    let pinnedDrops = 0;
    let freeDrops = 0;
    for (let i = 0; i < 1000; i++) {
      if (pinned.frame(40, 30, i * 40, true) & FrameEvent.Downgrade) pinnedDrops++;
      if (free.frame(40, 30, i * 40, false) & FrameEvent.Downgrade) freeDrops++;
    }
    expect(pinnedDrops).toBe(0);
    expect(freeDrops).toBeGreaterThan(0);
  });

  it("at low, a slow p95 sustained for 5 s is a low-tier failure (not a downgrade); at high it is a downgrade after 3 s", () => {
    /** Simulated ms from the first slow evaluation to the event, and which event. */
    const run = (tier: "high" | "low") => {
      const loop = new FrameLoop(tier);
      loop.frame(16, 1, 0, false);
      for (let i = 1; i < 2000; i++) {
        const events = loop.frame(50, 1, i * 50, false);
        if (events & (FrameEvent.Downgrade | FrameEvent.LowFailure)) {
          return { atMs: i * 50, downgrade: !!(events & FrameEvent.Downgrade), lowFailure: !!(events & FrameEvent.LowFailure) };
        }
      }
      return null;
    };
    const high = run("high")!;
    const low = run("low")!;
    expect(high).toMatchObject({ downgrade: true, lowFailure: false });
    expect(low).toMatchObject({ downgrade: false, lowFailure: true });
    // Same warm-up and window; low waits 2 s longer (5 s instead of 3 s), to the evaluation step.
    expect(low.atMs - high.atMs).toBeGreaterThanOrEqual(2000 - 50 * 30);
    expect(low.atMs - high.atMs).toBeLessThanOrEqual(2000 + 50 * 30);
  });

  it("no low-tier failure while low holds its 33 ms limit (30 fps on a 60 Hz display)", () => {
    const loop = new FrameLoop("low");
    let events = 0;
    for (let i = 0; i < 3000; i++) events |= loop.frame(33.34, 5, i * 33.34, false);
    expect(events & (FrameEvent.LowFailure | FrameEvent.Downgrade)).toBe(0);
  });

  it("never fails a pinned low tier (?tier=low)", () => {
    const loop = new FrameLoop("low");
    let events = 0;
    for (let i = 0; i < 3000; i++) events |= loop.frame(80, 5, i * 80, true);
    expect(events & (FrameEvent.LowFailure | FrameEvent.Downgrade)).toBe(0);
  });

  it("a medium tier lowered to low switches to the low-tier rule", () => {
    const loop = new FrameLoop("medium");
    loop.setTier("low");
    let events = 0;
    for (let i = 0; i < 2000; i++) events |= loop.frame(50, 1, i * 50, false);
    expect(events & FrameEvent.LowFailure).toBeTruthy();
    expect(events & FrameEvent.Downgrade).toBe(0);
  });

  it("feeds the monitor the simulated interval when given (tests), but samples the measured one", async () => {
    const loop = new FrameLoop("low");
    loop.frame(16, 1, 0, false);
    const sample = loop.sample(10_000, 0);
    let events = 0;
    for (let i = 1; i < 2000 && !(events & FrameEvent.LowFailure); i++) events |= loop.frame(16.7, 1, i * 16.7, false, 60);
    expect(events & FrameEvent.LowFailure).toBeTruthy();
    loop.finishSample(1000);
    expect((await sample).intervalP95).toBeCloseTo(16.7);
  });

  it("uses the new tier's limit after setTier", () => {
    const loop = new FrameLoop("high");
    loop.setTier("low");
    let drops = 0;
    for (let i = 0; i < 1000; i++) if (loop.frame(33.3, 10, i * 33.3, false) & FrameEvent.Downgrade) drops++;
    expect(drops).toBe(0);
    expect(loop.currentTier).toBe("low");
  });

  it("samples frame intervals and CPU times for the numbers script", async () => {
    const loop = new FrameLoop("high");
    loop.frame(16, 1, 0, false);
    const result = loop.sample(100, 0);
    let done = false;
    for (let i = 1; !done && i < 100; i++) {
      done = (loop.frame(i % 10 === 0 ? 33 : 16, i % 10 === 0 ? 9 : 3, i * 16, false) & FrameEvent.SampleDone) !== 0;
    }
    expect(done).toBe(true);
    loop.finishSample(120);
    const s = await result;
    expect(s.frames).toBe(7);
    expect(s.intervalP50).toBe(16);
    expect(s.cpuP50).toBe(3);
    expect(s.durationMs).toBe(120);
  });
});
