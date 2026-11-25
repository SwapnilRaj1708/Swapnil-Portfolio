import type { FrameSample } from "@/lib/journey/debug";
import { FrameTimeMonitor, LOW_FAILURE_SUSTAIN_MS } from "@/lib/journey/frame-monitor";
import { TIER_LIMITS, type RenderTier } from "@/lib/journey/tiers";
import { percentile } from "./stats";

/** Frames the numbers script can sample in one go (about two minutes at 60 Hz). */
export const SAMPLE_CAPACITY = 8192;

/** What one frame asks the caller to do afterwards, outside the frame loop. */
export const FrameEvent = { None: 0, FirstFrame: 1, Downgrade: 2, SampleDone: 4, LowFailure: 8 } as const;

/**
 * Per-frame bookkeeping of the canvas (journey-canvas.tsx `FrameDriver`): the first frame, the
 * downgrade monitor and the numbers script's sampling. Everything is allocated in the constructor;
 * `frame()` only writes numbers. Returns a bit set of FrameEvent for the caller to act on later.
 *
 * On `high` and `medium` a sustained slow p95 (3 s) is a Downgrade: one tier down. On `low` there
 * is nothing lower to render: a slow p95 sustained for LOW_FAILURE_SUSTAIN_MS (5 s) is a
 * LowFailure, and the caller sends the session to the static tier.
 */
export class FrameLoop {
  readonly monitor = new FrameTimeMonitor();
  private first = true;
  private limitMs: number;
  private sustainMs: number;
  private sampling = false;
  private sampleStart = 0;
  private sampleUntil = 0;
  private n = 0;
  private readonly intervals = new Float64Array(SAMPLE_CAPACITY);
  private readonly cpu = new Float64Array(SAMPLE_CAPACITY);
  private resolveSample: ((s: FrameSample) => void) | null = null;

  constructor(private tier: RenderTier) {
    this.limitMs = TIER_LIMITS[tier].frameTimeP95Ms;
    this.sustainMs = FrameLoop.sustainFor(tier, this.monitor.options.sustainMs);
  }

  private static sustainFor(tier: RenderTier, normal: number): number {
    return tier === "low" ? LOW_FAILURE_SUSTAIN_MS : normal;
  }

  get currentTier(): RenderTier {
    return this.tier;
  }

  /** A new tier: its limit and sustain time, and the monitor starts over. */
  setTier(tier: RenderTier): void {
    this.tier = tier;
    this.limitMs = TIER_LIMITS[tier].frameTimeP95Ms;
    this.sustainMs = FrameLoop.sustainFor(tier, this.monitor.options.sustainMs);
    this.monitor.reset();
  }

  /** After a pause the next interval spans the pause: start the monitor over. */
  resume(): void {
    this.monitor.reset();
  }

  /**
   * One rendered frame. `intervalMs`: time since the previous frame; `cpuMs`: this frame's work;
   * `nowMs`: its start; `pinned`: the tier is forced (no downgrade, no low-tier failure).
   * `monitorMs`: the interval the downgrade monitor sees – the measured one, unless a test
   * simulates frame times (`window.__journey.simulatedFrameMs`).
   */
  frame(intervalMs: number, cpuMs: number, nowMs: number, pinned: boolean, monitorMs: number = intervalMs): number {
    let events: number = FrameEvent.None;
    if (this.first) {
      this.first = false;
      events |= FrameEvent.FirstFrame;
    } else if (!pinned && this.monitor.push(monitorMs, this.limitMs, this.sustainMs)) {
      events |= this.tier === "low" ? FrameEvent.LowFailure : FrameEvent.Downgrade;
    }
    if (this.sampling) {
      if (this.n < SAMPLE_CAPACITY) {
        this.intervals[this.n] = intervalMs;
        this.cpu[this.n] = cpuMs;
        this.n++;
      }
      if (nowMs >= this.sampleUntil || this.n >= SAMPLE_CAPACITY) {
        this.sampling = false;
        events |= FrameEvent.SampleDone;
      }
    }
    return events;
  }

  /** Starts sampling frame intervals and CPU times for `durationMs` (the numbers script). */
  sample(durationMs: number, nowMs: number): Promise<FrameSample> {
    this.n = 0;
    this.sampleStart = nowMs;
    this.sampleUntil = nowMs + durationMs;
    this.sampling = true;
    return new Promise((resolve) => {
      this.resolveSample = resolve;
    });
  }

  /** Called outside the frame loop after FrameEvent.SampleDone. */
  finishSample(nowMs: number): void {
    const n = this.n;
    this.resolveSample?.({
      frames: n,
      durationMs: nowMs - this.sampleStart,
      intervalP50: percentile(this.intervals, n, 0.5),
      intervalP95: percentile(this.intervals, n, 0.95),
      intervalP99: percentile(this.intervals, n, 0.99),
      cpuP50: percentile(this.cpu, n, 0.5),
      cpuP95: percentile(this.cpu, n, 0.95),
      cpuP99: percentile(this.cpu, n, 0.99),
    });
    this.resolveSample = null;
  }
}
