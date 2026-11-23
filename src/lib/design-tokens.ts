import { mixSrgb } from "./contrast";

/**
 * Reads the colour tokens from the stylesheet text (src/app/globals.css), so the CSS stays the
 * one source. Resolves hex values and `color-mix(in srgb, var(--color-a) N%, var(--color-b))`.
 * Used by the contrast test and the dev style guide.
 */
export function parseColorTokens(css: string): Record<string, string> {
  const raw = new Map<string, string>();
  for (const m of css.matchAll(/--color-([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    if (m[1] === "*") continue;
    raw.set(m[1], m[2].trim());
  }

  const resolved: Record<string, string> = {};
  const resolve = (name: string, seen: Set<string>): string => {
    if (resolved[name]) return resolved[name];
    const value = raw.get(name);
    if (value === undefined) throw new Error(`Unknown colour token --color-${name}`);
    if (seen.has(name)) throw new Error(`Circular colour token --color-${name}`);
    seen.add(name);

    let hex: string;
    if (/^#[0-9a-f]{3,6}$/i.test(value)) {
      hex = value.toLowerCase();
    } else {
      const mix =
        /^color-mix\(\s*in srgb\s*,\s*var\(--color-([a-z0-9-]+)\)\s+([\d.]+)%\s*,\s*var\(--color-([a-z0-9-]+)\)\s*\)$/i.exec(
          value,
        );
      if (!mix) {
        throw new Error(
          `--color-${name}: only hex or color-mix(in srgb, var(--color-a) N%, var(--color-b)) is allowed, got "${value}"`,
        );
      }
      hex = mixSrgb(resolve(mix[1], seen), Number(mix[2]), resolve(mix[3], seen));
    }
    resolved[name] = hex;
    return hex;
  };

  for (const name of raw.keys()) resolve(name, new Set());
  return resolved;
}
