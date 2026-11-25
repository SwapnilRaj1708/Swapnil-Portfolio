/**
 * A critically damped spring, integrated exactly (STANDARDS.md §1: with smoothing off, the camera
 * eases toward the scroll position in the frame loop). Pure and allocation-free, unit-tested
 * (damping.test.ts).
 *
 * For a fixed target the closed-form step is exact, so the result after a given time does not
 * depend on how that time is cut into frames: 60, 144 or 30 fps reach the same value at the same
 * moment (frame-rate independent). Critically damped: the fastest approach that never overshoots.
 *
 *   x  = value − target,  ω = stiffness (rad/s; larger = snappier),  e = exp(−ω·dt)
 *   x' = (x + (v + ω·x)·dt) · e
 *   v' = (v − ω·(v + ω·x)·dt) · e
 */

export type Spring = { value: number; velocity: number };

export function stepSpring(spring: Spring, target: number, omega: number, dt: number): Spring {
  if (!(dt > 0)) return spring;
  if (!(omega > 0)) {
    spring.value = target;
    spring.velocity = 0;
    return spring;
  }
  const x = spring.value - target;
  const v = spring.velocity;
  const e = Math.exp(-omega * dt);
  const k = (v + omega * x) * dt;
  spring.value = target + (x + k) * e;
  spring.velocity = (v - omega * k) * e;
  return spring;
}

/** Puts the spring at the target, at rest (arriving mid-page: no fly-through). */
export function snapSpring(spring: Spring, target: number): Spring {
  spring.value = target;
  spring.velocity = 0;
  return spring;
}
