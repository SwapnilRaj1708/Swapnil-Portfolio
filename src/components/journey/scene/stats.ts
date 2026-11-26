import { Mesh, Texture, type Material, type Object3D, type WebGLRenderer } from "three";
import type { SceneStats } from "@/lib/journey/debug";

/**
 * Scene numbers for the numbers script and the tests (STANDARDS.md §3, §8). Called on demand,
 * never in the frame loop. Draw calls and triangles are the last rendered frame's (three resets
 * `renderer.info.render` at every render call; the scene renders once per frame).
 */

/** Bytes per pixel of an uncompressed RGBA8 texture. */
const BYTES_PER_PIXEL = 4;

export function textureBytes(texture: Texture): number {
  // A compressed texture (KTX2, PF-009) uploads exactly its transcoded mip levels.
  const mipmaps = (texture as Texture & { isCompressedTexture?: boolean; mipmaps?: { data?: ArrayBufferView }[] }).mipmaps;
  if ((texture as { isCompressedTexture?: boolean }).isCompressedTexture && Array.isArray(mipmaps)) {
    return mipmaps.reduce((sum, level) => sum + (level.data?.byteLength ?? 0), 0);
  }
  const image = texture.image as { width?: number; height?: number } | null;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  const base = width * height * BYTES_PER_PIXEL;
  // A full mip chain adds a third.
  return texture.generateMipmaps ? Math.round((base * 4) / 3) : base;
}

/** Every texture the scene's materials use, counted once. */
export function estimateTextureBytes(root: Object3D): number {
  const seen = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof Texture) seen.add(value);
      }
      const uniforms = (material as Material & { uniforms?: Record<string, { value: unknown }> }).uniforms;
      if (uniforms) for (const u of Object.values(uniforms)) if (u.value instanceof Texture) seen.add(u.value);
    }
  });
  let total = 0;
  for (const t of seen) total += textureBytes(t);
  return total;
}

/** The context's unmasked renderer string and the powerPreference it was created with. */
function readGpu(gl: WebGLRenderer): { renderer: string | null; powerPreference: string | null } {
  try {
    const context = gl.getContext();
    const info = context.getExtension("WEBGL_debug_renderer_info");
    return {
      renderer: String(context.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : context.RENDERER)),
      powerPreference: context.getContextAttributes()?.powerPreference ?? null,
    };
  } catch {
    return { renderer: null, powerPreference: null };
  }
}

export function readSceneStats(gl: WebGLRenderer, scene: Object3D, tier: string): SceneStats {
  return {
    ...readGpu(gl),
    tier,
    pixelRatio: gl.getPixelRatio(),
    drawCalls: gl.info.render.calls,
    triangles: gl.info.render.triangles,
    geometries: gl.info.memory.geometries,
    textures: gl.info.memory.textures,
    textureBytes: estimateTextureBytes(scene),
    programs: gl.info.programs?.length ?? 0,
  };
}

/** Percentile (0–1, nearest rank) of the first `n` values of an array (sorted here, a copy). */
export function percentile(values: Float64Array, n: number, p: number): number {
  if (n <= 0) return 0;
  const sorted = values.slice(0, n).sort();
  return sorted[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))];
}
