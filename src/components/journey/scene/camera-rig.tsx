"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { PerspectiveCamera } from "three";
import { snapSpring, stepSpring, type Spring } from "@/lib/journey/damping";
import { countRender, journeyDebug } from "@/lib/journey/debug";
import { frameAt } from "@/lib/journey/path-mapping";
import { cameraDamped } from "@/lib/journey/scroll-mode";
import { scrollStore } from "@/lib/journey/scroll-store";
import { scrollTuning } from "../scroll/scroll.tuning";
import { loadJourneyPath, pathTime, type JourneyPath } from "./path-asset";

/** The longest step the camera's ease takes in one frame (s): after a pause, no jump in velocity. */
const MAX_STEP_S = 0.1;

/**
 * The camera rig (STANDARDS.md §1, §6). It loads the journey path (path-asset.ts) and, every frame,
 * scrubs it by the scroll store: the frame for the current chapter and its progress (markers →
 * frames, path-mapping.ts), then the animated camera's world transform and vertical FOV are copied
 * to the scene's camera. React never re-renders for this: the store is read with getState() inside
 * the frame loop, and nothing is allocated there.
 *
 * Where Lenis smooths the scroll the camera follows it directly. Without Lenis (`?smooth=off`,
 * touch-first devices) it eases toward it with a critically damped spring (damping.ts), tuned by
 * `scrollTuning.cameraDamping`. Whenever the scroll position was set rather than travelled – the
 * first frame, a cold load mid-page, a deep link, a return from another page (the store's epoch) –
 * it snaps to the pose at once: no fly-through from the start.
 *
 * `onSettled` is called once, when the path is ready (or could not be loaded: the camera then keeps
 * its default pose, the port's).
 */
export function CameraRig({ onSettled }: { onSettled: (path: JourneyPath | null) => void }) {
  countRender("CameraRig");
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const [path, setPath] = useState<JourneyPath | null>(null);
  // Mutated in the frame loop only (never during render): a ref, not state.
  const motionRef = useRef({ spring: { value: 0, velocity: 0 } as Spring, epoch: -1, target: 0 });

  useEffect(() => {
    let cancelled = false;
    loadJourneyPath().then(
      (loaded) => {
        if (cancelled) return;
        if (process.env.NODE_ENV !== "production") {
          for (const w of loaded.warnings) console[w.level](`[journey path] ${w.message}`);
        }
        setPath(loaded);
        onSettled(loaded);
      },
      (error: unknown) => {
        if (cancelled) return;
        if (process.env.NODE_ENV !== "production") console.warn("[journey path] could not load the camera path; the camera stays at the port", error);
        onSettled(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [onSettled]);

  // Debug hook: the path and where the camera is.
  useEffect(() => {
    const debug = journeyDebug();
    if (!debug || !path) return;
    const motion = motionRef.current;
    debug.rig = () => ({
      ready: true,
      fps: path.frames.fps,
      firstFrame: path.frames.firstFrame,
      lastFrame: path.frames.end,
      starts: [...path.frames.starts],
      problem: path.frames.problem?.message ?? null,
      clipStart: path.sampler.clipStart,
      frame: motion.spring.value,
      targetFrame: motion.target,
      position: camera.position.toArray() as [number, number, number],
      quaternion: camera.quaternion.toArray() as [number, number, number, number],
      fov: camera.fov,
    });
    return () => {
      debug.rig = null;
    };
  }, [path, camera]);

  useFrame((_, delta) => {
    if (!path) return;
    const motion = motionRef.current;
    const s = scrollStore.getState();
    const target = s.active ? frameAt(path.frames, s.chapterIndex, s.chapterProgress) : path.frames.starts[0];
    motion.target = target;
    if (motion.epoch !== s.epoch || !s.active || !cameraDamped(s.mode ?? "lenis")) {
      snapSpring(motion.spring, target);
      motion.epoch = s.epoch;
    } else {
      stepSpring(motion.spring, target, scrollTuning.cameraDamping, delta > MAX_STEP_S ? MAX_STEP_S : delta);
    }
    path.sampler.apply(pathTime(path, motion.spring.value), camera);
  });

  return null;
}
