import { Box3, Color, ShaderMaterial, type Mesh } from "three";
import { PALETTE } from "@/styles/palette";
import type { ShaderContext, ShaderDefinition } from "./library";

/**
 * `test_grid` – the pipeline test piece's panel (PF-009). It exists to prove that the vertex-colour
 * mask (`Col` in Blender, COLOR_0 in glTF, `color` in three.js) arrives intact and LINEAR
 * (Blender question 3):
 *
 *   green = 1 on the 10 cm border  → trace amber;
 *   red   = 0 → 1 from left to right → a brightness ramp from `surface` to `text` (× 0.6);
 *   a signal-cyan line where red = 0.5 exactly, and a notch in the border at the panel's
 *   geometric centre (from its bounding box, not from the mask). Red is linear in x, so the line
 *   runs through the notch. Had red been stored sRGB-encoded (0.216 at the centre, as in the first
 *   export), the line would sit 0.17 m right of it.
 *
 * Tone mapping and output colour space are the renderer's (the includes at the end), like every
 * other surface. Low tier: the same picture without derivatives (fixed line width).
 *
 * Uniforms:
 *   uSurface   vec3   ramp start (linear) – palette `surface`
 *   uRampHigh  vec3   ramp end (linear) – palette `text` × 0.6
 *   uTrace     vec3   border colour (linear) – palette `accent-trace`
 *   uSignal    vec3   the red = 0.5 line (linear) – palette `accent-signal`
 *   uCentreX   float  world x of the panel's geometric centre (m), set from its bounding box
 *   uLineWidth float  half-width of the line, in mask units (low tier) or derivative multiples (high/medium)
 */

const vertexShader = /* glsl */ `
varying vec3 vMask;
varying float vWorldX;
void main() {
  // three declares \`color\` (vec3, or vec4 with alpha) from COLOR_0 because vertexColors is on.
  vMask = vec3(color.r, color.g, color.b);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldX = world.x;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uSurface;
uniform vec3 uRampHigh;
uniform vec3 uTrace;
uniform vec3 uSignal;
uniform float uCentreX;
uniform float uLineWidth;
varying vec3 vMask;
varying float vWorldX;
void main() {
  float ramp = clamp(vMask.r, 0.0, 1.0);
  float border = step(0.5, vMask.g);
  vec3 colour = mix(uSurface, uRampHigh, ramp);
  #ifdef LOW_TIER
    float line = 1.0 - step(uLineWidth, abs(ramp - 0.5));
    float notch = 1.0 - step(0.006, abs(vWorldX - uCentreX));
  #else
    float line = 1.0 - smoothstep(0.0, uLineWidth * fwidth(ramp), abs(ramp - 0.5));
    float notch = 1.0 - smoothstep(0.0, max(0.006, 1.5 * fwidth(vWorldX)), abs(vWorldX - uCentreX));
  #endif
  colour = mix(colour, uSignal, line * (1.0 - border));
  colour = mix(colour, uTrace, border);
  colour = mix(colour, uSurface, notch * border);
  gl_FragColor = vec4(colour, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function centreX(mesh: Mesh): number {
  mesh.geometry.computeBoundingBox();
  mesh.updateWorldMatrix(true, false);
  const box = new Box3().copy(mesh.geometry.boundingBox ?? new Box3()).applyMatrix4(mesh.matrixWorld);
  return (box.min.x + box.max.x) / 2;
}

export const testGrid: ShaderDefinition = {
  name: "test_grid",
  description: "Pipeline test panel: shows the COLOR_0 mask (green border, red ramp) and proves it is linear.",
  uniforms: {
    uSurface: "vec3 – ramp start, palette surface (linear)",
    uRampHigh: "vec3 – ramp end, palette text × 0.6 (linear)",
    uTrace: "vec3 – border, palette accent-trace (linear)",
    uSignal: "vec3 – the red = 0.5 line, palette accent-signal (linear)",
    uCentreX: "float – world x of the panel's geometric centre (m)",
    uLineWidth: "float – line half-width: mask units (low) or derivative multiples (high/medium)",
  },
  create(ctx: ShaderContext) {
    const low = ctx.tier === "low";
    const material = new ShaderMaterial({
      name: ctx.source.name,
      vertexShader,
      fragmentShader,
      vertexColors: true,
      side: ctx.source.side,
      defines: low ? { LOW_TIER: "" } : {},
      uniforms: {
        uSurface: { value: new Color(PALETTE.surface) },
        uRampHigh: { value: new Color(PALETTE.text).multiplyScalar(0.6) },
        uTrace: { value: new Color(PALETTE["accent-trace"]) },
        uSignal: { value: new Color(PALETTE["accent-signal"]) },
        uCentreX: { value: centreX(ctx.mesh) },
        uLineWidth: { value: low ? 0.004 : 1.5 },
      },
    });
    return material;
  },
};
