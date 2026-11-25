// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { PerspectiveCamera, Quaternion } from "three";
import { describe, expect, it } from "vitest";
import { buildStandinPath, STANDIN_DEFAULTS } from "../../../../scripts/lib/standin-path.mjs";
import { CHAPTER_IDS } from "@/lib/journey/chapters";
import { createJourneyPath, parsePathGlb, poseCameraAt, type JourneyPath } from "./path-asset";

// PF-008: the camera rig plays whatever world-path.glb + world-path.json say. Replacing them with a
// new export needs no code change: here the committed stand-in is loaded, then a second, different
// generated pair (other fps, frame range, time origin, world position, length and markers), and
// the rig follows each pair's own markers and frame range.

const DIR = path.resolve(__dirname, "../../../../public/assets/world");

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function load(glb: Uint8Array, json: unknown): Promise<JourneyPath> {
  return createJourneyPath(await parsePathGlb(toArrayBuffer(glb)), json);
}

type Pose = { frame: number; position: number[]; quaternion: number[] };

/** The rig at each chapter start and at the end matches the generator's pose for that frame. */
function expectRigFollows(journey: JourneyPath, json: { firstFrame: number; lastFrame: number; markers: Record<string, number> }, poses: Pose[]) {
  const camera = new PerspectiveCamera(50, 1, 0.1, 50);
  const byFrame = new Map(poses.map((p) => [p.frame, p]));
  const check = (frame: number) => {
    const expected = byFrame.get(frame)!;
    // The GLB stores float32: equal to within its precision.
    camera.position.toArray().forEach((v, i) => expect(v).toBeCloseTo(expected.position[i], 4));
    const angle = camera.quaternion.angleTo(new Quaternion(...(expected.quaternion as [number, number, number, number])));
    expect(angle).toBeLessThan(1e-4);
  };
  CHAPTER_IDS.forEach((id, i) => {
    // The camera reaches each chapter's marker exactly when the chapter starts.
    expect(poseCameraAt(journey, i, 0, camera)).toBe(json.markers[`CH_${id}`]);
    check(json.markers[`CH_${id}`]);
  });
  // The last chapter runs to the last frame.
  expect(poseCameraAt(journey, CHAPTER_IDS.length - 1, 1, camera)).toBe(json.lastFrame);
  check(json.lastFrame);
  // The vertical FOV and clip planes come from the path's camera.
  expect(camera.fov).toBeCloseTo(STANDIN_DEFAULTS.yfovDegrees, 6);
  expect(camera.far).toBe(200);
}

describe("camera path (world-path.glb + world-path.json)", () => {
  it("the committed stand-in is the generator's output, and the rig plays it marker by marker", async () => {
    const glb = new Uint8Array(readFileSync(path.join(DIR, "world-path.glb")));
    const json = JSON.parse(readFileSync(path.join(DIR, "world-path.json"), "utf8"));
    const generated = buildStandinPath();
    // `npm run path:standin` writes exactly these bytes: the committed files are not stale.
    expect(Buffer.from(glb).equals(Buffer.from(generated.glb))).toBe(true);
    expect(json).toEqual(generated.json);

    const journey = await load(glb, json);
    expect(journey.warnings).toEqual([]);
    expect(journey.frames.starts).toEqual(CHAPTER_IDS.map((id) => json.markers[`CH_${id}`]));
    expectRigFollows(journey, json, generated.poses);
  });

  it("a second, different export swaps in with no code change: new markers, frame range, fps and time origin", async () => {
    const second = buildStandinPath({
      fps: 24,
      firstFrame: 10,
      lastFrame: 250,
      timeOrigin: "frame",
      offset: [5, 2, -3],
      length: 30,
      markers: { CH_port: 10, CH_bus: 40, CH_memory: 100, CH_array: 130, CH_core: 190, CH_uplink: 230 },
    });
    const journey = await load(second.glb, second.json);
    expect(journey.warnings).toEqual([]);
    expect(journey.frames).toMatchObject({ fps: 24, firstFrame: 10, end: 250, starts: [10, 40, 100, 130, 190, 230] });
    // Keys start at firstFrame / fps here (Blender's frame numbers kept), not at 0.
    expect(journey.sampler.clipStart).toBeCloseTo(10 / 24, 6);
    expectRigFollows(journey, second.json, second.poses);

    // And it is really another path: the stand-in's port pose is not this one's.
    const standin = await load(buildStandinPath().glb, buildStandinPath().json);
    const a = new PerspectiveCamera();
    const b = new PerspectiveCamera();
    poseCameraAt(standin, 0, 0, a);
    poseCameraAt(journey, 0, 0, b);
    expect(a.position.distanceTo(b.position)).toBeGreaterThan(1);
  });

  it("a file with missing markers still plays, spaced evenly, with a warning", async () => {
    const { glb, json } = buildStandinPath();
    const { CH_array: _drop, ...markers } = json.markers; // eslint-disable-line @typescript-eslint/no-unused-vars
    const journey = await load(glb, { ...json, markers });
    expect(journey.warnings).toEqual([{ level: "warn", message: expect.stringContaining("CH_array") }]);
    expect(journey.frames.starts).toEqual([1, 61, 121, 181, 241, 301]);
  });

  it("markers out of order are an error, spaced evenly", async () => {
    const { glb, json } = buildStandinPath();
    const journey = await load(glb, { ...json, markers: { ...json.markers, CH_bus: 200 } });
    expect(journey.warnings[0]).toMatchObject({ level: "error" });
    expect(journey.frames.problem?.kind).toBe("out-of-order");
  });
});
