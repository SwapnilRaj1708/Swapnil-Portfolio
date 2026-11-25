import { describe, expect, it } from "vitest";
import { DEFAULT_FRAME_MONITOR, FrameTimeMonitor, LOW_FAILURE_SUSTAIN_MS, percentileOfSorted } from "./frame-monitor";

const HIGH = 16.7;

/** Feeds `ms` worth of frames of `frameMs` each; returns how many downgrades were reported. */
function run(monitor: FrameTimeMonitor, frameMs: number, ms: number, limit = HIGH): number {
  let downgrades = 0;
  for (let t = 0; t < ms; t += frameMs) if (monitor.push(frameMs, limit)) downgrades++;
  return downgrades;
}

describe("percentile", () => {
  it("uses the nearest rank", () => {
    const sorted = Float64Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentileOfSorted(sorted, 100, 0.95)).toBe(95);
    expect(percentileOfSorted(sorted, 100, 0.5)).toBe(50);
    expect(percentileOfSorted(sorted, 20, 0.95)).toBe(19);
    expect(percentileOfSorted(sorted, 0, 0.95)).toBe(0);
  });
});

describe("the frame-time monitor", () => {
  it("keeps the tier while frames hold the display rate (60 Hz)", () => {
    expect(run(new FrameTimeMonitor(), 16.67, 60_000)).toBe(0);
  });

  it("tolerates timer jitter around 16.7 ms", () => {
    const m = new FrameTimeMonitor();
    let downgrades = 0;
    for (let i = 0; i < 6000; i++) if (m.push(i % 2 ? 17.6 : 15.8, HIGH)) downgrades++;
    expect(downgrades).toBe(0);
  });

  it("ignores everything during the warm-up", () => {
    const m = new FrameTimeMonitor();
    expect(run(m, 50, DEFAULT_FRAME_MONITOR.warmupMs - 50)).toBe(0);
    expect(m.lastP95).toBe(-1);
  });

  it("drops one tier when the p95 stays over the limit long enough", () => {
    const m = new FrameTimeMonitor();
    let frames = 0;
    while (!m.push(33.3, HIGH)) frames++;
    // Warm-up, a full window, then the sustain time.
    const elapsed = frames * 33.3;
    const { warmupMs, sustainMs, windowSize } = DEFAULT_FRAME_MONITOR;
    expect(elapsed).toBeGreaterThanOrEqual(warmupMs + sustainMs);
    expect(elapsed).toBeLessThan(warmupMs + windowSize * 33.3 + sustainMs + 2000);
  });

  it("reports one step at a time: after a drop it warms up and measures again", () => {
    const m = new FrameTimeMonitor();
    run(m, 33.3, 1);
    let drops = 0;
    let firstAt = -1;
    let secondAt = -1;
    for (let t = 0; t < 30_000; t += 33.3) {
      if (m.push(33.3, HIGH)) {
        drops++;
        if (firstAt < 0) firstAt = t;
        else if (secondAt < 0) secondAt = t;
      }
    }
    expect(drops).toBeGreaterThan(1);
    // The second report needs a whole new warm-up + window + sustain.
    expect(secondAt - firstAt).toBeGreaterThanOrEqual(DEFAULT_FRAME_MONITOR.warmupMs + DEFAULT_FRAME_MONITOR.sustainMs);
  });

  it("does not drop on a short spike (one second of slow frames)", () => {
    const m = new FrameTimeMonitor();
    run(m, 16.67, 5000);
    expect(run(m, 40, 1000)).toBe(0);
    expect(run(m, 16.67, 20_000)).toBe(0);
  });

  it("does not drop when only a few frames in twenty are slow", () => {
    const m = new FrameTimeMonitor();
    let downgrades = 0;
    // 1 slow frame in 25 = 4 % < 5 %: the p95 stays at the display rate.
    for (let i = 0; i < 6000; i++) if (m.push(i % 25 === 0 ? 50 : 16.67, HIGH)) downgrades++;
    expect(downgrades).toBe(0);
  });

  it("drops when one frame in ten misses the display refresh", () => {
    const m = new FrameTimeMonitor();
    let downgrades = 0;
    for (let i = 0; i < 6000; i++) if (m.push(i % 10 === 0 ? 33.3 : 16.67, HIGH)) downgrades++;
    expect(downgrades).toBeGreaterThan(0);
  });

  it("uses each tier's limit: 30 fps is fine for low, not for medium", () => {
    expect(run(new FrameTimeMonitor(), 33.3, 20_000, 33)).toBe(0);
    expect(run(new FrameTimeMonitor(), 33.3, 20_000, 20)).toBeGreaterThan(0);
  });

  it("starts over on reset (a pause, a tier change)", () => {
    const m = new FrameTimeMonitor();
    run(m, 33.3, DEFAULT_FRAME_MONITOR.warmupMs + 4000 + 2500);
    m.reset();
    expect(m.lastP95).toBe(-1);
    // Back in warm-up: nothing for the warm-up time even at 10 fps.
    expect(run(m, 100, DEFAULT_FRAME_MONITOR.warmupMs - 100)).toBe(0);
  });

  it("takes a longer sustain time per call (low's 5 s): the same slow frames need 2 s more", () => {
    const at = (sustainMs?: number) => {
      const m = new FrameTimeMonitor();
      let t = 0;
      while (!m.push(50, 33, sustainMs)) t += 50;
      return t;
    };
    const normal = at();
    const low = at(LOW_FAILURE_SUSTAIN_MS);
    expect(LOW_FAILURE_SUSTAIN_MS).toBe(5000);
    expect(low - normal).toBeGreaterThanOrEqual(LOW_FAILURE_SUSTAIN_MS - DEFAULT_FRAME_MONITOR.sustainMs - 50 * DEFAULT_FRAME_MONITOR.evaluateEvery);
    expect(low - normal).toBeLessThanOrEqual(LOW_FAILURE_SUSTAIN_MS - DEFAULT_FRAME_MONITOR.sustainMs + 50 * DEFAULT_FRAME_MONITOR.evaluateEvery);
  });

  it("clamps a single huge interval (a stall) instead of letting it dominate", () => {
    const m = new FrameTimeMonitor();
    run(m, 16.67, 5000);
    m.push(10_000, HIGH);
    expect(run(m, 16.67, 20_000)).toBe(0);
  });
});
