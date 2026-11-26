import { MeshBasicMaterial, type Material, type Mesh } from "three";
import { SHADER_NAMES, type ShaderName } from "@/lib/journey/assets/shader-names";
import type { RenderTier } from "@/lib/journey/tiers";
import { PALETTE } from "@/styles/palette";
import { testGrid } from "./test-grid";

/**
 * The site's shader library (STANDARDS.md §4: shaders live in one shared library, each with a
 * low-tier variant and documented uniforms; chapters use them, they do not copy them). A material
 * named `SHADER_<name>` in an asset is replaced by the material this library creates for `<name>`
 * (src/components/journey/assets/contract.ts). The names are listed in
 * src/lib/journey/assets/shader-names.ts, which the asset pipeline reads to warn about unknown
 * names at export time; library.test.ts keeps the two equal.
 */

export type ShaderContext = {
  /** The material the asset brought (its name, side; placeholder colour). */
  source: Material;
  /** The mesh it will draw (geometry, world matrix at load). */
  mesh: Mesh;
  tier: RenderTier;
};

export type ShaderDefinition = {
  name: ShaderName;
  description: string;
  /** Uniform name → what it is (documentation, shown nowhere at runtime). */
  uniforms: Record<string, string>;
  /** A new material for one mesh; the `low` tier gets the shader's low variant. */
  create: (ctx: ShaderContext) => Material;
};

export const SHADER_LIBRARY: Record<ShaderName, ShaderDefinition> = {
  test_grid: testGrid,
};

/** Looks a shader up by name; replaceable in tests and in the dev route's unknown-name demo. */
export type ShaderLookup = (name: string) => ShaderDefinition | undefined;

export const libraryLookup: ShaderLookup = (name) =>
  (SHADER_NAMES as readonly string[]).includes(name) ? SHADER_LIBRARY[name as ShaderName] : undefined;

/**
 * The material for a name the library does not know. In development: an obvious one (trace-amber
 * wireframe) – the warning goes to the console. In production: a plain dark surface, silently.
 */
export function fallbackShaderMaterial(name: string, dev: boolean): Material {
  return dev
    ? new MeshBasicMaterial({ name: `SHADER_${name} (unknown – fallback)`, color: PALETTE["accent-trace"], wireframe: true })
    : new MeshBasicMaterial({ name: `SHADER_${name} (fallback)`, color: PALETTE.surface });
}
