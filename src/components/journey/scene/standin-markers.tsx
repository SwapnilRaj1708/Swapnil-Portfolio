"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, Vector3 } from "three";
import { countRender } from "@/lib/journey/debug";
import { PALETTE } from "@/styles/palette";
import { poseAtFrame, type JourneyPath } from "./path-asset";

/**
 * Stand-in chapter markers (PF-008, until PF-010's grey-box world): one dark pillar per chapter,
 * placed from the path itself – at each chapter's start pose, ahead of the camera and to its right
 * (away from the text column on wide screens). So the glide visibly passes one pillar per chapter,
 * and a new path export moves them along with it.
 *
 * Plumbing, not a look: one instanced mesh (one draw call), unlit `surface-raised`. Unlit and dark
 * on purpose: tone mapping only darkens it, so nothing it puts behind text is brighter than
 * `surface-raised` (src/styles/contrast-pairs.ts). Disposed on unmount.
 */

/** Where a pillar stands relative to its chapter's start pose (camera space, metres). */
const OFFSET = new Vector3(4.5, 0, -14);
const SIZE = { width: 0.6, height: 7, depth: 0.6 };

export function StandinMarkers({ path }: { path: JourneyPath }) {
  countRender("StandinMarkers");
  const mesh = useMemo(() => {
    const geometry = new BoxGeometry(SIZE.width, SIZE.height, SIZE.depth);
    const material = new MeshBasicMaterial({ name: "standin-marker", color: new Color(PALETTE["surface-raised"]) });
    const starts = path.frames.starts;
    const instanced = new InstancedMesh(geometry, material, starts.length);
    const matrix = new Matrix4();
    const position = new Vector3();
    starts.forEach((frame, i) => {
      const pose = poseAtFrame(path, frame);
      position.copy(OFFSET).applyMatrix4(pose.matrix);
      instanced.setMatrixAt(i, matrix.makeTranslation(position.x, position.y, position.z));
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
    instanced.name = "standin-markers";
    return instanced;
  }, [path]);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
      mesh.dispose();
    },
    [mesh],
  );

  return <primitive object={mesh} />;
}
