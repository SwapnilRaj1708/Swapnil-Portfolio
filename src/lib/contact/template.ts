/** Fills `{name}` placeholders in a content string; unknown placeholders are left as they are. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-z-]+)\}/gi, (whole, key: string) => (key in values ? String(values[key]) : whole));
}
