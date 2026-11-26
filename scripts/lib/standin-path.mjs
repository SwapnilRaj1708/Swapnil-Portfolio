// The stand-in journey camera path (PF-008), until PF-010 delivers the one authored in Blender.
//
// Builds the pair the asset contract names (STANDARDS.md §6, the journey camera):
//   world-path.glb   a camera node `CAM_journey` (perspective, vertical FOV 35°) animated over the
//                    whole frame range as the clip `journey` (translation + rotation, LINEAR, a key
//                    on every frame)
//   world-path.json  { fps, firstFrame, lastFrame, markers: { CH_port: n, … } }
//
// It is plumbing, not a look: a slow glide forward with a gentle drift, rise and yaw. Its start
// pose is PF-007's camera (0, 0, 8) looking down −Z with a 35° FOV, so the port stop frames the
// test object exactly as before. During the port chapter the camera only moves forward, left and
// up and turns left, which carries the test object (right of the hero copy) further right and down
// on screen – never across the copy.
//
// The GLB is written by hand (a JSON chunk and a binary chunk), so the script needs no exporter
// and no browser APIs. Options exist so tests can generate a second, different pair and prove a
// new export needs no code change.

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export const CHAPTER_ORDER = ["port", "bus", "memory", "array", "core", "uplink"];

/** The stand-in: 30 fps, frames 1–361 (12 s), unevenly spaced markers (so even spacing would show). */
export const STANDIN_DEFAULTS = {
  fps: 30,
  firstFrame: 1,
  lastFrame: 361,
  markers: { CH_port: 1, CH_bus: 55, CH_memory: 115, CH_array: 175, CH_core: 245, CH_uplink: 305 },
  /** "zero": the first frame's key at 0 s (Blender's "slide to zero"); "frame": at firstFrame / fps. */
  timeOrigin: "zero",
  /** World offset of the whole path (metres). */
  offset: [0, 0, 0],
  /** Distance travelled forward (metres). */
  length: 48,
  yfovDegrees: 35,
};

const smooth = (u) => u * u * (3 - 2 * u);

/** The camera pose at path fraction u (0–1): position [x, y, z] and yaw / pitch / roll (radians). */
export function standinPose(u, options = STANDIN_DEFAULTS) {
  const [ox, oy, oz] = options.offset ?? [0, 0, 0];
  const length = options.length ?? 48;
  return {
    position: [ox - 1.6 * Math.sin(Math.PI * u), oy + 0.9 * smooth(u), oz + 8 - length * u],
    yaw: 0.14 * Math.sin(2 * Math.PI * u),
    pitch: -0.02 * smooth(u),
    roll: 0.03 * Math.sin(2 * Math.PI * u),
  };
}

/** Quaternion [x, y, z, w] of yaw (Y) · pitch (X) · roll (Z). */
export function quaternionYXZ(yaw, pitch, roll) {
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const cx = Math.cos(pitch / 2);
  const sx = Math.sin(pitch / 2);
  const cz = Math.cos(roll / 2);
  const sz = Math.sin(roll / 2);
  // qY * qX
  const ax = cy * sx;
  const ay = sy * cx;
  const az = -sy * sx;
  const aw = cy * cx;
  // (qY * qX) * qZ
  return [ax * cz + ay * sz, ay * cz - ax * sz, aw * sz + az * cz, aw * cz - az * sz];
}

function pad4(n) {
  return (4 - (n % 4)) % 4;
}

/**
 * Builds the pair. Returns { glb: Uint8Array, json: object, poses } – `poses` holds the position and
 * quaternion written for each frame (tests compare the rig against them).
 */
export function buildStandinPath(overrides = {}) {
  const o = { ...STANDIN_DEFAULTS, ...overrides };
  const { fps, firstFrame, lastFrame } = o;
  const count = lastFrame - firstFrame + 1;
  const times = new Float32Array(count);
  const translations = new Float32Array(count * 3);
  const rotations = new Float32Array(count * 4);
  const poses = [];
  for (let i = 0; i < count; i++) {
    const frame = firstFrame + i;
    const u = i / (count - 1);
    times[i] = o.timeOrigin === "frame" ? frame / fps : i / fps;
    const pose = standinPose(u, o);
    const q = quaternionYXZ(pose.yaw, pose.pitch, pose.roll);
    translations.set(pose.position, i * 3);
    rotations.set(q, i * 4);
    poses.push({ frame, position: pose.position, quaternion: q });
  }

  const views = [times, translations, rotations];
  const offsets = [];
  let byteLength = 0;
  for (const v of views) {
    offsets.push(byteLength);
    byteLength += v.byteLength + pad4(v.byteLength);
  }
  const bin = new Uint8Array(byteLength);
  views.forEach((v, i) => bin.set(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), offsets[i]));

  const minMax = (arr, size) => {
    const min = Array(size).fill(Infinity);
    const max = Array(size).fill(-Infinity);
    for (let i = 0; i < arr.length; i++) {
      min[i % size] = Math.min(min[i % size], arr[i]);
      max[i % size] = Math.max(max[i % size], arr[i]);
    }
    return { min, max };
  };

  const gltf = {
    asset: { version: "2.0", generator: "scripts/make-standin-path.mjs (PF-008 stand-in)" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "CAM_journey", camera: 0, translation: Array.from(translations.subarray(0, 3)), rotation: Array.from(rotations.subarray(0, 4)) }],
    cameras: [{ name: "CAM_journey", type: "perspective", perspective: { yfov: (o.yfovDegrees * Math.PI) / 180, znear: 0.1, zfar: 200 } }],
    animations: [
      {
        name: "journey",
        channels: [
          { sampler: 0, target: { node: 0, path: "translation" } },
          { sampler: 1, target: { node: 0, path: "rotation" } },
        ],
        samplers: [
          { input: 0, output: 1, interpolation: "LINEAR" },
          { input: 0, output: 2, interpolation: "LINEAR" },
        ],
      },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: "SCALAR", ...minMax(times, 1) },
      { bufferView: 1, componentType: 5126, count, type: "VEC3", ...minMax(translations, 3) },
      { bufferView: 2, componentType: 5126, count, type: "VEC4", ...minMax(rotations, 4) },
    ],
    bufferViews: views.map((v, i) => ({ buffer: 0, byteOffset: offsets[i], byteLength: v.byteLength })),
    buffers: [{ byteLength }],
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = pad4(jsonBytes.length);
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length;
  const glb = new Uint8Array(total);
  const view = new DataView(glb.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length + jsonPad, true);
  view.setUint32(16, CHUNK_JSON, true);
  glb.set(jsonBytes, 20);
  glb.fill(0x20, 20 + jsonBytes.length, 20 + jsonBytes.length + jsonPad); // JSON chunk pads with spaces
  const binStart = 20 + jsonBytes.length + jsonPad;
  view.setUint32(binStart, bin.length, true);
  view.setUint32(binStart + 4, CHUNK_BIN, true);
  glb.set(bin, binStart + 8);

  const json = { fps, firstFrame, lastFrame, markers: { ...o.markers } };
  return { glb, json, poses };
}
