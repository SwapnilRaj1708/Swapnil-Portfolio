/**
 * Frame-time monitor: decides when the measured frame time demands a lower tier (STANDARDS.md §2,
 * §3). It runs inside the frame loop, so it allocates nothing after construction: a fixed ring of
 * frame times and a scratch array that is sorted in place.
 *
 * Rule: after a warm-up, keep the last `windowSize` frame times. Every `evaluateEvery` frames take
 * their 95th percentile. When it stays above the tier's limit × `tolerance` for `sustainMs` of
 * frame time, report a downgrade (once) and start over (warm-up again).
 *
 * What a frame time is: the interval between two animation frames, the only number every browser
 * gives. On a display that refreshes at 60 Hz the interval is quantised to ~16.7 ms, ~33.3 ms … so
 * a p95 above 16.7 × 1.1 ms means at least one frame in twenty missed the display refresh. The
 * tolerance keeps ordinary timer jitter around 16.7 ms from counting as a miss.
 */

export type FrameMonitorOptions = {
  /** Frames in the rolling window. */
  windowSize: number;
  /** Frame time ignored after a (re)start: shader compilation, first uploads, the fade-in. */
  warmupMs: number;
  /** How long the p95 must stay over the limit before the tier drops. */
  sustainMs: number;
  /** Frames between two evaluations of the p95. */
  evaluateEvery: number;
  /** Multiplier on the limit that a p95 must exceed (timer jitter). */
  tolerance: number;
  /** A single interval longer than this (a stall, a debugger pause) is clamped to it. */
  maxFrameMs: number;
};

/**
 * At `low` there is no lower render tier: when the p95 stays over low's limit (33 ms × tolerance)
 * for this long, the session goes static for good (STANDARDS §2, owner decision on PF-007).
 */
export const LOW_FAILURE_SUSTAIN_MS = 5000;

export const DEFAULT_FRAME_MONITOR: FrameMonitorOptions = {
  windowSize: 120,
  warmupMs: 2000,
  sustainMs: 3000,
  evaluateEvery: 30,
  tolerance: 1.1,
  maxFrameMs: 250,
};

/** p-th percentile (0–1) of the first `n` values of `sorted` (ascending), nearest-rank method. */
export function percentileOfSorted(sorted: ArrayLike<number>, n: number, p: number): number {
  if (n <= 0) return 0;
  const rank = Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1));
  return sorted[rank];
}

export class FrameTimeMonitor {
  readonly options: FrameMonitorOptions;
  private readonly ring: Float64Array;
  private readonly scratch: Float64Array;
  private count = 0;
  private next = 0;
  private sinceEvaluation = 0;
  private elapsedMs = 0;
  private overSinceMs = -1;
  /** The last p95 computed (ms), for the debug hooks; -1 before the first evaluation. */
  lastP95 = -1;

  constructor(options: Partial<FrameMonitorOptions> = {}) {
    this.options = { ...DEFAULT_FRAME_MONITOR, ...options };
    this.ring = new Float64Array(this.options.windowSize);
    this.scratch = new Float64Array(this.options.windowSize);
  }

  /** Starts over: after a tier change, a pause, a context restore. */
  reset(): void {
    this.count = 0;
    this.next = 0;
    this.sinceEvaluation = 0;
    this.elapsedMs = 0;
    this.overSinceMs = -1;
    this.lastP95 = -1;
  }

  /**
   * Records one frame interval. Returns true when the p95 stayed over `limitMs` × tolerance for
   * `sustainMs` (default: the options' value) – the tier should drop one step, or at `low` the
   * session goes static (frame-loop.ts). The monitor has then already started over.
   */
  push(frameMs: number, limitMs: number, sustainMs: number = this.options.sustainMs): boolean {
    const o = this.options;
    const dt = frameMs > o.maxFrameMs ? o.maxFrameMs : frameMs < 0 ? 0 : frameMs;
    this.elapsedMs += dt;
    if (this.elapsedMs < o.warmupMs) return false;

    this.ring[this.next] = dt;
    this.next = (this.next + 1) % o.windowSize;
    if (this.count < o.windowSize) this.count++;
    if (++this.sinceEvaluation < o.evaluateEvery || this.count < o.windowSize) return false;
    this.sinceEvaluation = 0;

    this.scratch.set(this.ring);
    this.scratch.sort();
    const p95 = percentileOfSorted(this.scratch, this.count, 0.95);
    this.lastP95 = p95;

    if (p95 <= limitMs * o.tolerance) {
      this.overSinceMs = -1;
      return false;
    }
    if (this.overSinceMs < 0) {
      this.overSinceMs = this.elapsedMs;
      return false;
    }
    if (this.elapsedMs - this.overSinceMs < sustainMs) return false;
    this.reset();
    return true;
  }
}
