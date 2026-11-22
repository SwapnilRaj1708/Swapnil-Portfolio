// Capture targets for `npm run review:shots`.
//
// A target is a named place to photograph: a route, plus an optional `prepare(page)` step that
// moves the page into position (PF-008 adds chapter stops here, e.g. scroll to a chapter's
// start, middle and end and wait for the scene to settle).
//
// On the command line, an argument that starts with "/" is a route; anything else must be a
// name in NAMED_TARGETS.

/**
 * @typedef {object} Target
 * @property {string} name     File-name slug, e.g. "home" → home-desktop.png
 * @property {string} path     Route to open, e.g. "/"
 * @property {(page: import("@playwright/test").Page) => Promise<void>} [prepare]
 */

/** @type {Record<string, Omit<Target, "name">>} */
export const NAMED_TARGETS = {
  // Chapter stops are added by PF-008, for example:
  // "port-start": { path: "/", prepare: async (page) => { /* scroll to the start of `port` */ } },
};

export const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: "phone", width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];

export const DEFAULT_TARGETS = ["/"];

/** "/" → "home", "/work/some-project" → "work-some-project". */
export function routeSlug(route) {
  const slug = route
    .replace(/[?#].*$/, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase();
  return slug || "home";
}

/**
 * Turns command-line arguments into targets.
 * @param {string[]} args
 * @returns {Target[]}
 */
export function resolveTargets(args) {
  const list = args.length ? args : DEFAULT_TARGETS;
  return list.map((arg) => {
    if (arg.startsWith("/")) return { name: routeSlug(arg), path: arg };
    const named = NAMED_TARGETS[arg];
    if (!named) {
      const known = Object.keys(NAMED_TARGETS);
      throw new Error(
        `Unknown target "${arg}". Use a route starting with "/"` +
          (known.length ? ` or one of: ${known.join(", ")}` : "") +
          ".",
      );
    }
    return { name: arg, ...named };
  });
}
