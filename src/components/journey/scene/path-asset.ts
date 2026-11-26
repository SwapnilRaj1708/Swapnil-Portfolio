import { Matrix4, PerspectiveCamera, PropertyBinding, Vector3, type AnimationClip, type Interpolant, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CHAPTER_IDS } from "@/lib/journey/chapters";
import { clipTimeForFrame, frameAt, parsePathTiming, resolveChapterFrames, type ChapterFrames, type PathTiming } from "@/lib/journey/path-mapping";

/**
 * The journey camera path (STANDARDS.md §6): `world-path.glb` (a camera named `CAM_journey` with the
 * animation clip `journey`) and `world-path.json` (fps, first and last frame, CH_ marker frames),
 * both from one fixed public folder, JOURNEY_PATH_DIR; nothing else names it
 * (scripts/make-standin-path.mjs writes there). PF-009 kept it: the path is not a chapter asset and
 * does not go through the asset pipeline (whose output is public/assets/<chapter>/<slug>/).
 *
 * Replacing the two files with a new export needs no code change: the camera is found by name, the
 * clip by name, the frame range and the chapter starts come from the JSON, and every animated
 * transform of the clip is sampled (scene/path-swap.test.ts proves it with a second generated pair).
 */
export const JOURNEY_PATH_DIR = "/assets/world/";
export const JOURNEY_PATH_FILES = { glb: "world-path.glb", json: "world-path.json" } as const;
export const JOURNEY_CAMERA_NAME = "CAM_journey";
export const JOURNEY_CLIP_NAME = "journey";

type Channel = { interpolant: Interpolant; node: Object3D; property: "position" | "quaternion" | "scale" };

/**
 * Samples the clip at a time and writes the animated camera's world transform and lens into a
 * target camera. Everything is allocated in the constructor; `apply` allocates nothing (it runs in
 * the frame loop): each track's interpolant writes into its own result buffer.
 */
export class PathSampler {
  /** The clip's first and last key times (s). */
  readonly clipStart: number;
  readonly clipEnd: number;
  /** Tracks the sampler cannot apply (not a transform): reported, ignored. */
  readonly ignoredTracks: string[] = [];
  private readonly channels: Channel[] = [];
  private readonly scale = new Vector3();

  constructor(
    private readonly root: Object3D,
    clip: AnimationClip,
    readonly source: PerspectiveCamera,
  ) {
    let start = Infinity;
    let end = -Infinity;
    for (const track of clip.tracks) {
      const { nodeName, propertyName } = PropertyBinding.parseTrackName(track.name);
      const node = PropertyBinding.findNode(root, nodeName) as Object3D | null;
      if (!node || (propertyName !== "position" && propertyName !== "quaternion" && propertyName !== "scale")) {
        this.ignoredTracks.push(track.name);
        continue;
      }
      // `createInterpolant` is the track's own factory (linear, slerp, glTF cubic spline …).
      const interpolant = (track as unknown as { createInterpolant: () => Interpolant }).createInterpolant();
      this.channels.push({ interpolant, node, property: propertyName });
      start = Math.min(start, track.times[0]);
      end = Math.max(end, track.times[track.times.length - 1]);
    }
    if (!this.channels.length) throw new Error(`world-path.glb: the clip "${clip.name}" animates no transform`);
    this.clipStart = start;
    this.clipEnd = end;
  }

  /** Poses the path at `time` (s) and copies the camera's world pose and lens into `target`. */
  apply(time: number, target: PerspectiveCamera): void {
    for (let i = 0; i < this.channels.length; i++) {
      const c = this.channels[i];
      const values = c.interpolant.evaluate(time);
      c.node[c.property].fromArray(values as unknown as number[]);
    }
    this.root.updateMatrixWorld(true);
    this.source.matrixWorld.decompose(target.position, target.quaternion, this.scale);
    const lens = this.source;
    if (target.fov !== lens.fov || target.near !== lens.near || target.far !== lens.far) {
      // Vertical FOV, near and far from the path's camera; the aspect stays the canvas's (React
      // Three Fiber sets it on resize), so a resize keeps the vertical FOV.
      target.fov = lens.fov;
      target.near = lens.near;
      target.far = lens.far;
      target.updateProjectionMatrix();
    }
  }
}

export type JourneyPath = {
  sampler: PathSampler;
  frames: ChapterFrames;
  timing: PathTiming;
  /** Problems with the files that the path survives (logged in development). */
  warnings: { level: "warn" | "error"; message: string }[];
};

type GltfLike = { scene: Object3D; animations: AnimationClip[]; cameras: Object3D[] };

function findJourneyCamera(gltf: GltfLike): PerspectiveCamera | null {
  const perspective = gltf.cameras.filter((c): c is PerspectiveCamera => (c as PerspectiveCamera).isPerspectiveCamera === true);
  const named = (object: Object3D | null): boolean => {
    for (let o = object; o; o = o.parent) if (o.name.startsWith(JOURNEY_CAMERA_NAME)) return true;
    return false;
  };
  return perspective.find(named) ?? perspective[0] ?? null;
}

/** Builds the path from a parsed glTF and the JSON's timing. */
export function createJourneyPath(gltf: GltfLike, timingJson: unknown): JourneyPath {
  const warnings: JourneyPath["warnings"] = [];
  const timing = parsePathTiming(timingJson);
  const clip = gltf.animations.find((a) => a.name === JOURNEY_CLIP_NAME) ?? gltf.animations[0];
  if (!clip) throw new Error("world-path.glb: no animation clip");
  if (clip.name !== JOURNEY_CLIP_NAME) warnings.push({ level: "warn", message: `world-path.glb: no clip "${JOURNEY_CLIP_NAME}", using "${clip.name}"` });
  const camera = findJourneyCamera(gltf);
  if (!camera) throw new Error("world-path.glb: no perspective camera");
  if (!camera.name.startsWith(JOURNEY_CAMERA_NAME) && !camera.parent?.name.startsWith(JOURNEY_CAMERA_NAME)) {
    warnings.push({ level: "warn", message: `world-path.glb: no camera "${JOURNEY_CAMERA_NAME}", using "${camera.name}"` });
  }
  const sampler = new PathSampler(gltf.scene, clip, camera);
  if (sampler.ignoredTracks.length) warnings.push({ level: "warn", message: `world-path.glb: ignored tracks ${sampler.ignoredTracks.join(", ")}` });
  const frames = resolveChapterFrames(CHAPTER_IDS, timing);
  if (frames.problem) warnings.push({ level: frames.problem.kind === "missing" ? "warn" : "error", message: frames.problem.message });
  return { sampler, frames, timing, warnings };
}

/** Parses the GLB bytes (no network). */
export function parsePathGlb(data: ArrayBuffer): Promise<GltfLike> {
  return new GLTFLoader().parseAsync(data, "") as Promise<GltfLike>;
}

/** Fetches and builds the path from JOURNEY_PATH_DIR. */
export async function loadJourneyPath(dir: string = JOURNEY_PATH_DIR): Promise<JourneyPath> {
  const [glb, json] = await Promise.all([fetch(dir + JOURNEY_PATH_FILES.glb), fetch(dir + JOURNEY_PATH_FILES.json)]);
  if (!glb.ok || !json.ok) throw new Error(`world-path: HTTP ${glb.status} / ${json.status}`);
  const [bytes, timing] = await Promise.all([glb.arrayBuffer(), json.json()]);
  return createJourneyPath(await parsePathGlb(bytes), timing);
}

/** Clip time (s) of a path frame. */
export function pathTime(path: JourneyPath, frame: number): number {
  return clipTimeForFrame(frame, path.frames, path.sampler.clipStart);
}

/**
 * What the rig does each frame, without the easing: the frame for a chapter and its progress, then
 * the camera pose at that frame. Returns the frame. Allocation-free.
 */
export function poseCameraAt(path: JourneyPath, chapterIndex: number, chapterProgress: number, target: PerspectiveCamera): number {
  const frame = frameAt(path.frames, chapterIndex, chapterProgress);
  path.sampler.apply(pathTime(path, frame), target);
  return frame;
}

/** The camera pose at a chapter's start, for the stand-in markers (not the frame loop). */
export function poseAtFrame(path: JourneyPath, frame: number): { position: Vector3; matrix: Matrix4 } {
  const camera = new PerspectiveCamera();
  path.sampler.apply(pathTime(path, frame), camera);
  camera.updateMatrix();
  return { position: camera.position.clone(), matrix: camera.matrix.clone() };
}
