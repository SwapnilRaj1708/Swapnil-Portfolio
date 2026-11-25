/**
 * Tunable values of the PF-007 test object (STANDARDS.md §5). The dev panel (dev-tools.tsx) writes
 * into this object and its "Export values" button copies it as JSON; the next prompt bakes the
 * owner's values in here. The frame loop reads the fields directly (no React state).
 */
export const testObjectTuning = {
  /** Turns per second around the vertical axis, in radians. */
  rotationSpeed: 0.25,
  /** Emissive intensity of the trace-amber accent (1 = the palette value). */
  emissiveIntensity: 1.4,
  /** The cool key light. */
  keyLightIntensity: 2.2,
  /** The hemisphere fill. */
  fillLightIntensity: 0.9,
};

export type TestObjectTuning = typeof testObjectTuning;
