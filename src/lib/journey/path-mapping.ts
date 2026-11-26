/**
 * The camera path's markers → clip time (STANDARDS.md §6, the journey camera). Pure, unit-tested
 * (path-mapping.test.ts).
 *
 * `world-path.json` = { fps, firstFrame, lastFrame, markers: { CH_port: n, CH_bus: n, … } }: the
 * Blender timeline markers where each chapter starts. Inside chapter i, `chapterProgress` (0–1)
 * maps linearly to the frames between marker CH_i and the next chapter's marker; the last chapter
 * runs to `lastFrame`. So the camera reaches each chapter's marker exactly when its DOM section
 * starts.
 *
 * A broken file must not break the page: missing markers (a warning in development) or markers out
 * of order or outside the frame range (an error in development) fall back to even spacing of the
 * chapters over the whole frame range.
 */

export type PathTiming = {
  fps: number;
  firstFrame: number;
  lastFrame: number;
  markers: Record<string, number>;
};

export type MarkerProblem = { kind: "missing" | "out-of-order" | "bad-range"; message: string };

export type ChapterFrames = {
  /** Start frame of each chapter, in registry order. */
  starts: number[];
  /** The frame the last chapter runs to (`lastFrame`). */
  end: number;
  firstFrame: number;
  fps: number;
  /** Why even spacing was used instead of the markers, or null. */
  problem: MarkerProblem | null;
};

/** Reads world-path.json's object; throws on a file that is not the contract's shape at all. */
export function parsePathTiming(value: unknown): PathTiming {
  const v = value as Partial<PathTiming> | null;
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  if (!v || !num(v.fps) || !num(v.firstFrame) || !num(v.lastFrame) || typeof v.markers !== "object" || v.markers === null) {
    throw new Error("world-path.json: expected { fps, firstFrame, lastFrame, markers }");
  }
  const markers: Record<string, number> = {};
  for (const [name, frame] of Object.entries(v.markers)) if (num(frame)) markers[name] = frame as number;
  return { fps: v.fps as number, firstFrame: v.firstFrame as number, lastFrame: v.lastFrame as number, markers };
}

function evenStarts(count: number, first: number, last: number): number[] {
  const span = last - first;
  return Array.from({ length: count }, (_, i) => first + (span * i) / count);
}

/** Each chapter's start frame from the markers (`CH_<id>`), or even spacing with the reason. */
export function resolveChapterFrames(chapterIds: readonly string[], timing: PathTiming): ChapterFrames {
  const { fps, firstFrame, lastFrame, markers } = timing;
  const base = { end: lastFrame, firstFrame, fps };
  if (!(fps > 0) || !(lastFrame > firstFrame)) {
    return {
      ...base,
      starts: evenStarts(chapterIds.length, firstFrame, Math.max(firstFrame, lastFrame)),
      problem: { kind: "bad-range", message: `world-path.json: fps ${fps}, frames ${firstFrame}–${lastFrame} is not a usable range` },
    };
  }
  const names = chapterIds.map((id) => `CH_${id}`);
  const missing = names.filter((n) => markers[n] === undefined);
  if (missing.length) {
    return {
      ...base,
      starts: evenStarts(chapterIds.length, firstFrame, lastFrame),
      problem: { kind: "missing", message: `world-path.json: missing marker(s) ${missing.join(", ")} – the chapters are spaced evenly` },
    };
  }
  const starts = names.map((n) => markers[n]);
  const outside = names.filter((n) => markers[n] < firstFrame || markers[n] >= lastFrame);
  const unordered = starts.some((f, i) => i > 0 && f <= starts[i - 1]);
  if (outside.length || unordered) {
    const detail = outside.length
      ? `marker(s) ${outside.join(", ")} outside the frame range ${firstFrame}–${lastFrame}`
      : `markers out of chapter order (${names.map((n) => `${n} ${markers[n]}`).join(", ")})`;
    return {
      ...base,
      starts: evenStarts(chapterIds.length, firstFrame, lastFrame),
      problem: { kind: "out-of-order", message: `world-path.json: ${detail} – the chapters are spaced evenly` },
    };
  }
  return { ...base, starts, problem: null };
}

/** The frame for a chapter and its progress (0–1): linear from its start to the next one's. */
export function frameAt(frames: ChapterFrames, chapterIndex: number, chapterProgress: number): number {
  const n = frames.starts.length;
  if (n === 0) return frames.firstFrame;
  const i = chapterIndex < 0 ? 0 : chapterIndex >= n ? n - 1 : chapterIndex;
  const p = chapterProgress < 0 ? 0 : chapterProgress > 1 ? 1 : chapterProgress;
  const start = frames.starts[i];
  const end = i + 1 < n ? frames.starts[i + 1] : frames.end;
  return start + (end - start) * p;
}

/**
 * Clip time (s) for a frame. `clipStart` is the clip's first key time: an exporter may write the
 * first frame at 0 s or at firstFrame / fps; the first key is the first frame either way.
 */
export function clipTimeForFrame(frame: number, frames: Pick<ChapterFrames, "firstFrame" | "fps">, clipStart: number): number {
  return clipStart + (frame - frames.firstFrame) / frames.fps;
}
