/**
 * The names of the site's registered shaders (STANDARDS.md §4: one shared library). A material
 * named `SHADER_<name>` is drawn with the shader of that name. The library itself (three.js code,
 * in the lazy 3D chunk) is src/components/journey/assets/shaders/library.ts; its test keeps its
 * keys equal to this list. The asset pipeline (scripts/asset.mjs) imports this file to warn loudly
 * about an unknown name, so it has no imports.
 */
export const SHADER_NAMES = ["test_grid"] as const;

export type ShaderName = (typeof SHADER_NAMES)[number];

export function isShaderName(name: string): name is ShaderName {
  return (SHADER_NAMES as readonly string[]).includes(name);
}
