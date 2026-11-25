import { describe, expect, it } from "vitest";
import { snapSpring, stepSpring, type Spring } from "./damping";

// PF-008: the camera's ease toward the scroll position with smoothing off.

function run(fps: number, seconds: number, omega: number, target = 1): Spring {
  const spring = { value: 0, velocity: 0 };
  const dt = 1 / fps;
  const steps = Math.round(seconds * fps);
  for (let i = 0; i < steps; i++) stepSpring(spring, target, omega, dt);
  return spring;
}

describe("critically damped spring", () => {
  it("is frame-rate independent: 30, 60, 144 and 240 fps reach the same value at the same time", () => {
    const reference = run(60, 0.5, 6);
    for (const fps of [30, 144, 240]) {
      const s = run(fps, 0.5, 6);
      expect(s.value).toBeCloseTo(reference.value, 10);
      expect(s.velocity).toBeCloseTo(reference.velocity, 10);
    }
  });

  it("matches the closed form x(t) = (x0 + (v0 + ω·x0)·t)·e^(−ω·t)", () => {
    const t = 0.4;
    const omega = 6;
    const x0 = -1; // value 0, target 1
    const expected = 1 + (x0 + omega * x0 * t) * Math.exp(-omega * t);
    expect(run(60, t, omega).value).toBeCloseTo(expected, 10);
  });

  it("never overshoots and settles on the target", () => {
    const spring = { value: 0, velocity: 0 };
    let max = 0;
    for (let i = 0; i < 600; i++) {
      stepSpring(spring, 1, 8, 1 / 60);
      max = Math.max(max, spring.value);
    }
    expect(max).toBeLessThanOrEqual(1);
    expect(spring.value).toBeCloseTo(1, 6);
  });

  it("is unchanged by a zero or negative time step, and jumps with no stiffness", () => {
    const spring = { value: 0.3, velocity: 0.1 };
    expect(stepSpring(spring, 1, 6, 0)).toEqual({ value: 0.3, velocity: 0.1 });
    expect(stepSpring(spring, 1, 0, 1 / 60)).toEqual({ value: 1, velocity: 0 });
  });

  it("snaps to the target at rest (arriving mid-page)", () => {
    expect(snapSpring({ value: 0, velocity: 3 }, 0.7)).toEqual({ value: 0.7, velocity: 0 });
  });
});
