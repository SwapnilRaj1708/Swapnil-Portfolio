// Asset budgets (budgets.config.mjs `assets`): a slug's own limits over its chapter's
// (STANDARDS.md §3). Every check returns readable messages; the pipeline fails on any.

const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** The limits that apply to `<chapter>/<slug>`, and where each came from. */
export function resolveBudget(assetBudgets, chapter, slug) {
  const key = `${chapter}/${slug}`;
  const own = assetBudgets.slugs?.[key] ?? {};
  const base = assetBudgets.chapter;
  const budget = { ...base, ...own, images: { ...base.images, ...(own.images ?? {}) } };
  const source = (field) => (field in own ? `budgets.config.mjs assets.slugs["${key}"].${field}` : `budgets.config.mjs assets.chapter.${field}`);
  return { key, budget, source };
}

/** Input checks (the raw export's numbers, `measureDocument`). */
export function checkInputBudget(stats, { budget, source }) {
  const errors = [];
  const over = (what, value, limit, field) => {
    if (limit !== null && limit !== undefined && value > limit) errors.push(`${what}: ${group(value)} > ${group(limit)} (${source(field)})`);
  };
  over("triangles (drawn)", stats.trianglesDrawn, budget.triangles, "triangles");
  over("materials", stats.materials.length, budget.materials, "materials");
  over("objects", stats.objects, budget.objects, "objects");
  over("clips", stats.clips.length, budget.clips, "clips");
  over("images", stats.images.length, budget.images.count, "images");
  const sides = budget.images.sides ?? [];
  if (sides.length) {
    const sorted = [...stats.images].sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height));
    sorted.forEach((image, i) => {
      const limit = sides[Math.min(i, sides.length - 1)];
      const side = Math.max(image.width, image.height);
      if (side > limit) errors.push(`image "${image.name}": ${image.width} × ${image.height} > ${limit} (image ${i + 1} by size; ${source("images")})`);
    });
  }
  return errors;
}

/**
 * Output checks: the largest texture side per tier, and the chapter's download per tier (this
 * asset's files plus the chapter's other assets already in the manifest).
 */
export function checkOutputBudget({ textureSides, bytes, chapterOtherBytes }, { budget, source }) {
  const errors = [];
  for (const variant of ["high", "low"]) {
    const maxSide = budget.maxTextureSide?.[variant];
    for (const t of textureSides[variant] ?? []) {
      if (maxSide && Math.max(t.width, t.height) > maxSide) errors.push(`${variant}: texture "${t.name}" ${t.width} × ${t.height} > ${maxSide} (${source("maxTextureSide")})`);
    }
    const limit = budget.bytes?.[variant];
    const total = bytes[variant] + (chapterOtherBytes[variant] ?? 0);
    if (limit && total > limit) {
      errors.push(`${variant}: the chapter's assets would be ${group(total)} B (this asset ${group(bytes[variant])} B) > ${group(limit)} B (${source("bytes")})`);
    }
  }
  return errors;
}
