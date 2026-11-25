"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  Color,
  ExtrudeGeometry,
  MeshStandardMaterial,
  Shape,
  Vector3,
  type DirectionalLight,
  type Group,
  type HemisphereLight,
  type Mesh,
} from "three";
import { journeyDebug } from "@/lib/journey/debug";
import type { RenderTier } from "@/lib/journey/tiers";
import { PALETTE } from "@/styles/palette";
import { placeTestObject } from "./layout";
import { testObjectTuning as tuning } from "./test-object.tuning";

/**
 * PF-007's test object: plumbing, not a look. A bevelled chip in the palette's surface colour
 * (lit PBR) with one trace-amber emissive strip, two runtime lights, no shadows. It turns slowly
 * and sits outside the hero's text-safe area (layout.ts).
 *
 * It owns its geometries and materials and disposes them in its own cleanup, which runs before
 * React Three Fiber releases the renderer: three.js then frees their GPU programs and buffers while
 * the renderer still tracks them (R3F disposes removed objects later, on idle, after its renderer
 * teardown has already reset that bookkeeping).
 */

const HALF = 1;
const DEPTH = 0.28;
const BEVEL = 0.08;

function chipShape(): Shape {
  const r = 0.22;
  const s = new Shape();
  s.moveTo(-HALF + r, -HALF);
  s.lineTo(HALF - r, -HALF);
  s.quadraticCurveTo(HALF, -HALF, HALF, -HALF + r);
  s.lineTo(HALF, HALF - r);
  s.quadraticCurveTo(HALF, HALF, HALF - r, HALF);
  s.lineTo(-HALF + r, HALF);
  s.quadraticCurveTo(-HALF, HALF, -HALF, HALF - r);
  s.lineTo(-HALF, -HALF + r);
  s.quadraticCurveTo(-HALF, -HALF, -HALF + r, -HALF);
  return s;
}

const SURFACE = new Color(PALETTE.surface);
const TRACE = new Color(PALETTE["accent-trace"]);
const DARK = new Color(PALETTE.background);
const SKY = new Color(PALETTE.text);
const KEY = new Color(PALETTE["accent-signal"]);

export function TestObject({ tier }: { tier: RenderTier }) {
  const group = useRef<Group>(null);
  const trace = useRef<Mesh<BoxGeometry, MeshStandardMaterial>>(null);
  const key = useRef<DirectionalLight>(null);
  const fill = useRef<HemisphereLight>(null);
  const viewport = useThree((s) => s.viewport);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  // Fewer curve segments on the low tier. Disposed when replaced or unmounted.
  const geometry = useMemo(() => {
    const segments = tier === "low" ? 4 : 10;
    const g = new ExtrudeGeometry(chipShape(), {
      depth: DEPTH,
      curveSegments: segments,
      bevelEnabled: true,
      bevelThickness: BEVEL,
      bevelSize: BEVEL,
      bevelSegments: tier === "low" ? 1 : 3,
    });
    g.center();
    g.computeBoundingSphere();
    return g;
  }, [tier]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const parts = useMemo(
    () => ({
      chip: new MeshStandardMaterial({ name: "test-object-chip", color: SURFACE, metalness: 0.45, roughness: 0.45 }),
      traceGeometry: new BoxGeometry(1.3, 0.07, 0.02),
      trace: new MeshStandardMaterial({
        name: "test-object-trace",
        color: DARK,
        emissive: TRACE,
        emissiveIntensity: tuning.emissiveIntensity,
        roughness: 0.6,
      }),
    }),
    [],
  );
  useEffect(
    () => () => {
      parts.chip.dispose();
      parts.traceGeometry.dispose();
      parts.trace.dispose();
    },
    [parts],
  );

  const place = placeTestObject(viewport);
  const geometryRadius = geometry.boundingSphere?.radius ?? 1.5;
  const scale = place.radius / geometryRadius;

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const dt = delta > 0.1 ? 0.1 : delta;
    g.rotation.y += dt * tuning.rotationSpeed;
    if (trace.current) trace.current.material.emissiveIntensity = tuning.emissiveIntensity;
    if (key.current) key.current.intensity = tuning.keyLightIntensity;
    if (fill.current) fill.current.intensity = tuning.fillLightIntensity;
  });

  // Debug hook: the object's bounds on screen (its bounding sphere), for the safe-area test.
  useEffect(() => {
    const debug = journeyDebug();
    if (!debug) return;
    const corner = new Vector3();
    debug.objectRect = () => {
      const g = group.current;
      if (!g) return null;
      const r = place.radius;
      let left = Infinity;
      let right = -Infinity;
      let top = Infinity;
      let bottom = -Infinity;
      for (const dx of [-r, r]) {
        for (const dy of [-r, r]) {
          for (const dz of [-r, r]) {
            corner.set(place.x + dx, place.y + dy, dz).project(camera);
            const x = ((corner.x + 1) / 2) * size.width;
            const y = ((1 - corner.y) / 2) * size.height;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      }
      return { left, top, right, bottom };
    };
    return () => {
      debug.objectRect = null;
    };
  }, [camera, size, place.x, place.y, place.radius]);

  return (
    <>
      <hemisphereLight ref={fill} args={[SKY, DARK, tuning.fillLightIntensity]} />
      <directionalLight ref={key} color={KEY} position={[-3, 4, 5]} intensity={tuning.keyLightIntensity} />
      {/* Outer group: place, size and tilt (props); inner group: the spin (frame loop only). */}
      <group position={[place.x, place.y, 0]} scale={scale} rotation={[0.35, 0, 0]}>
        <group ref={group} rotation={[0, -0.5, 0]}>
          <mesh geometry={geometry} material={parts.chip} />
          <mesh ref={trace} geometry={parts.traceGeometry} material={parts.trace} position={[0, -0.15, DEPTH / 2 + BEVEL + 0.012]} />
        </group>
      </group>
    </>
  );
}
