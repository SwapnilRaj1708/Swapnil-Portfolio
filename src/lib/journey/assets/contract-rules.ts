/**
 * The asset contract's naming rules (STANDARDS.md §6, BLENDER.md §4), in one place for both sides:
 * the asset pipeline (scripts/asset.mjs, which imports this file through Node's type stripping –
 * so it has no imports of its own) and the site's loaders (src/components/journey/assets/).
 *
 *   materials  BAKED_<set> · PBR_<name> · SHADER_<name> · GLOW_<name>   (lower-case words after the prefix)
 *   meshes     <chapter>_<element>[_<part>]                              (lower case)
 *   empties    ANCHOR_<chapter> · HOTSPOT_<name> · INST_<prop>_<nnn> · GLOW_<name>
 *   clips      <object>_<verb>                                           (the object is the animated node)
 *
 * An instanced prop is one mesh named `<chapter>_<prop>`, authored at the origin; each
 * `INST_<prop>_<nnn>` empty places one copy, and the site never draws the source mesh in place.
 */

/** Lower-case words joined by single underscores: `pipeline_bench`, `slot_03`. */
const WORDS = "[a-z0-9]+(?:_[a-z0-9]+)*";

export const MATERIAL_KINDS = ["BAKED", "PBR", "SHADER", "GLOW"] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

const MATERIAL_RE = new RegExp(`^(BAKED|PBR|SHADER|GLOW)_(${WORDS})$`);

/** How the site draws a material (its prefix), or null when the name breaks the rule. */
export function materialKind(name: string): MaterialKind | null {
  const m = MATERIAL_RE.exec(name);
  return m ? (m[1] as MaterialKind) : null;
}

/** The registered-shader name of a `SHADER_<name>` material (`SHADER_test_grid` → `test_grid`). */
export function shaderNameOf(materialName: string): string | null {
  const m = MATERIAL_RE.exec(materialName);
  return m && m[1] === "SHADER" ? m[2] : null;
}

export const EMPTY_KINDS = ["ANCHOR", "HOTSPOT", "INST", "GLOW"] as const;
export type EmptyKind = (typeof EMPTY_KINDS)[number];

const HOTSPOT_RE = new RegExp(`^HOTSPOT_${WORDS}$`);
const GLOW_RE = new RegExp(`^GLOW_${WORDS}$`);
const INST_RE = /^INST_([a-z0-9]+(?:_[a-z0-9]+)*?)_(\d{3})$/;
const ANCHOR_RE = new RegExp(`^ANCHOR_(${WORDS})$`);

/** An `INST_<prop>_<nnn>` empty's prop and three-digit index, or null. */
export function parseInstName(name: string): { prop: string; index: number } | null {
  const m = INST_RE.exec(name);
  return m ? { prop: m[1], index: Number(m[2]) } : null;
}

/** The anchor's chapter (`ANCHOR_shared` → `shared`), or null. */
export function anchorChapterOf(name: string): string | null {
  return ANCHOR_RE.exec(name)?.[1] ?? null;
}

/**
 * What an empty means by its name, or null when the name breaks the rule. An anchor must name the
 * chapter of the asset it is in (`ANCHOR_<chapter>`).
 */
export function emptyKind(name: string, chapter: string): EmptyKind | null {
  if (anchorChapterOf(name) === chapter) return "ANCHOR";
  if (HOTSPOT_RE.test(name)) return "HOTSPOT";
  if (parseInstName(name)) return "INST";
  if (GLOW_RE.test(name)) return "GLOW";
  return null;
}

/** `<chapter>_<element>[_<part>]` in lower case. */
export function isMeshName(name: string, chapter: string): boolean {
  return new RegExp(`^${chapter}_${WORDS}$`).test(name);
}

/** The mesh an `INST_<prop>_*` empty instances: `<chapter>_<prop>`. */
export function instanceSourceName(chapter: string, prop: string): string {
  return `${chapter}_${prop}`;
}

/**
 * `<object>_<verb>`: the clip's name is one of the nodes it animates, then `_`, then one lower-case
 * word (`shared_test_cube_rise` animates `shared_test_cube`). Returns the object, or null.
 */
export function clipObjectOf(clipName: string, animatedNodes: readonly string[]): string | null {
  for (const node of [...animatedNodes].sort((a, b) => b.length - a.length)) {
    if (clipName.startsWith(`${node}_`) && /^[a-z]+$/.test(clipName.slice(node.length + 1))) return node;
  }
  return null;
}

/** Asset chapters: the scroll chapters (src/lib/journey/chapters.ts) plus `shared` (BLENDER.md §2). */
export const SHARED_CHAPTER = "shared";

/** An asset slug: lower-case words joined by hyphens (`pipeline-test`). */
export function isAssetSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}
