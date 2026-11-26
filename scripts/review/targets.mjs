// Capture targets for `npm run review:shots`.
//
// A target is a named place to photograph: a route, plus an optional `prepare(page)` step that
// moves the page into position.
//
// On the command line, an argument that starts with "/" is a route; `<chapter>:<start|mid|end>`
// is a chapter stop (PF-008: `/?tier=high` scrolled to the chapter's start, middle or end, resolved
// from the live registry, the camera settled), optionally `@desktop` or `@phone` for one viewport –
// written as `<chapter>-<point>-<viewport>.png`; anything else must be a name in NAMED_TARGETS.

/**
 * @typedef {object} Viewport
 * @property {string} name
 * @property {number} width
 * @property {number} height
 * @property {number} deviceScaleFactor
 * @property {boolean} isMobile
 * @property {boolean} hasTouch
 */

/**
 * @typedef {object} Target
 * @property {string} name     File-name slug, e.g. "home" → home-desktop.png
 * @property {string} path     Route to open, e.g. "/"
 * @property {(page: import("@playwright/test").Page) => Promise<void>} [prepare]
 * @property {Viewport[]} [viewports]  Overrides VIEWPORTS for this target
 * @property {import("@playwright/test").BrowserContextOptions} [contextOptions]  e.g. { javaScriptEnabled: false }
 * @property {string} [download]  Save the served file itself under this name instead of a
 *   screenshot (social images, icons); no viewports
 */

/** @type {Viewport[]} */
export const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: "phone", width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];

/** Narrowest supported layout: 360 CSS px (also what 200 % zoom on a 720 px window gives). */
export const NARROW_VIEWPORT = {
  name: "narrow",
  width: 360,
  height: 780,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

/** @type {Record<string, Omit<Target, "name">>} */
export const NAMED_TARGETS = {
  // `/` at 360 px wide → home-360-narrow.png
  "home-360": { path: "/", viewports: [NARROW_VIEWPORT] },
  // Phone menu opened → menu-open-phone.png
  "menu-open": {
    path: "/",
    viewports: [VIEWPORTS[1]],
    prepare: async (page) => {
      await page.getByRole("button", { name: "Menu" }).click();
      await page.getByRole("link", { name: "About" }).waitFor({ state: "visible" });
    },
  },
  // Contact flow "Transmission" (PF-019), the Hiring path step by step → contact-<step>-<viewport>.png.
  "contact-intent": { path: "/", prepare: (page) => contactFlow(page, 0) },
  "contact-role": { path: "/", prepare: (page) => contactFlow(page, 1) },
  "contact-mode": { path: "/", prepare: (page) => contactFlow(page, 2) },
  "contact-you": { path: "/", prepare: (page) => contactFlow(page, 3) },
  "contact-message": { path: "/", prepare: (page) => contactFlow(page, 4) },
  "contact-review": { path: "/", prepare: (page) => contactFlow(page, 5) },
  // Success state: the send is mocked in the browser (never reaches the endpoint).
  "contact-sent": { path: "/", prepare: (page) => contactFlow(page, 6) },
  // Freelance budget with the ₹ / $ toggle switched to $.
  "contact-budget": {
    path: "/",
    prepare: async (page) => {
      await openContactFlow(page);
      await chooseOption(page, "A freelance project");
      await page.getByRole("heading", { name: "Kind of project" }).waitFor();
      await chooseOption(page, "Web app");
      await page.getByRole("heading", { name: "Budget range" }).waitFor();
      await chooseOption(page, "$ USD");
      await settleOnFlow(page);
    },
  },
  // The drafted message on the Freelance path (Website, under ₹50k, 1–2 months).
  "contact-message-freelance": {
    path: "/",
    prepare: async (page) => {
      await openContactFlow(page);
      for (const [option, next] of [
        ["A freelance project", "Kind of project"],
        ["Website", "Budget range"],
        ["under ₹50k", "Timeline"],
        ["1–2 months", "Where can I reply?"],
      ]) {
        await chooseOption(page, option);
        await page.getByRole("heading", { name: next }).waitFor();
      }
      await page.getByRole("textbox", { name: "Your name" }).fill("Review Example");
      await page.getByRole("textbox", { name: "Your email" }).fill("review@example.com");
      await page.getByRole("button", { name: /Next/ }).click();
      await page.getByRole("heading", { name: "Your message" }).waitFor();
      await settleOnFlow(page);
    },
  },
  // The plain form without JavaScript: its top and its end (submit button).
  "contact-nojs": {
    path: "/",
    contextOptions: { javaScriptEnabled: false },
    prepare: async (page) => {
      // page.evaluate does not run with JavaScript off; Playwright scrolls through the protocol.
      await page.locator("#contact form legend").first().scrollIntoViewIfNeeded();
    },
  },
  "contact-nojs-end": {
    path: "/",
    contextOptions: { javaScriptEnabled: false },
    prepare: async (page) => {
      await page.getByRole("button", { name: "Transmit" }).scrollIntoViewIfNeeded();
    },
  },
  // Stage 1 home (PF-028): the social images and the icons as served, byte for byte.
  "social-home": { path: "/opengraph-image", download: "social-home.png" },
  "social-work": { path: "/work/opengraph-image", download: "social-work.png" },
  "social-resume": { path: "/resume/opengraph-image", download: "social-resume.png" },
  favicon: { path: "/favicon.ico", download: "favicon.ico" },
  "apple-icon": { path: "/apple-icon.png", download: "apple-icon.png" },
  "icon-192": { path: "/icon1.png", download: "icon-192.png" },
  "icon-512": { path: "/icon2.png", download: "icon-512.png" },
  // The home page with every image request refused: the sections as designed text (PF-028).
  "home-images-off": {
    path: "/",
    prepare: async (page) => {
      await page.route("**/_next/image**", (route) => route.abort());
      await page.reload({ waitUntil: "load" });
    },
  },
  // PF-007: the canvas shell. `?tier=` forces a tier (allowed off the production deployment).
  // The test object behind the hero on the high tier, desktop and phone.
  "home-high": { path: "/?tier=high", prepare: (page) => waitForCanvas(page) },
  // Forced low tier (pixel ratio 1, fewer segments, no antialiasing).
  "home-low": { path: "/?tier=low", viewports: [VIEWPORTS[0]], prepare: (page) => waitForCanvas(page) },
  // Reduced motion → the static tier: must equal the stage 1 hero.
  "home-reduced-motion": {
    path: "/",
    viewports: [VIEWPORTS[0]],
    contextOptions: { reducedMotion: "reduce" },
    prepare: (page) => waitForStatic(page, "reduced-motion"),
  },
  // Simple view on (remembered) → the static tier.
  "home-simple-view": {
    path: "/",
    viewports: [VIEWPORTS[1]],
    prepare: async (page) => {
      await page.evaluate(() => window.localStorage.setItem("simple-view", "on"));
      await page.reload({ waitUntil: "load" });
      await waitForStatic(page, "simple-view");
    },
  },
  // An opaque page: the canvas must not show through (desktop).
  "work-desktop": { path: "/work", viewports: [VIEWPORTS[0]] },
  // The dev tuning panel (leva) and performance overlay (r3f-perf). Needs a build with
  // ENABLE_DEV_PAGES=1; `?tune` shows them there (under `next dev` they show at once).
  "home-dev-tools": {
    path: "/?tier=high&tune",
    viewports: [VIEWPORTS[0]],
    prepare: async (page) => {
      await waitForCanvas(page);
      await page.locator("[data-dev-panel] > *").first().waitFor({ state: "visible", timeout: 15_000 });
      await page.locator("[data-journey-host] .__perf_toggle, [data-journey-host] canvas ~ div").first().waitFor({ state: "attached", timeout: 15_000 });
      await page.waitForTimeout(1500);
    },
  },
  // PF-009: the asset lab (/dev/assets, needs a build with ENABLE_DEV_PAGES=1), desktop only.
  "assets-high": { path: "/dev/assets?tier=high", viewports: [VIEWPORTS[0]], prepare: (page) => assetLab(page, { view: "overview" }) },
  "assets-low": { path: "/dev/assets?tier=low", viewports: [VIEWPORTS[0]], prepare: (page) => assetLab(page, { view: "overview" }) },
  "assets-shader": { path: "/dev/assets?tier=high", viewports: [VIEWPORTS[0]], prepare: (page) => assetLab(page, { view: "shader" }) },
  "assets-clip-0": { path: "/dev/assets?tier=high", viewports: [VIEWPORTS[0]], prepare: (page) => assetLab(page, { view: "overview", clip: 0 }) },
  "assets-clip-05": { path: "/dev/assets?tier=high", viewports: [VIEWPORTS[0]], prepare: (page) => assetLab(page, { view: "overview", clip: 0.5 }) },
  "assets-clip-1": { path: "/dev/assets?tier=high", viewports: [VIEWPORTS[0]], prepare: (page) => assetLab(page, { view: "overview", clip: 1 }) },
  "assets-labels": { path: "/dev/assets?tier=high", viewports: [VIEWPORTS[0]], prepare: (page) => assetLab(page, { view: "top" }) },
  // Load → unload: the readouts with the counters back at their baseline.
  "assets-unload": {
    path: "/dev/assets?tier=high",
    viewports: [VIEWPORTS[0]],
    prepare: async (page) => {
      await assetLab(page, { view: "overview" });
      await page.evaluate(() => window.__assetLab.unload());
      await page.waitForTimeout(800);
      await page.locator('[data-readout="renderer"]').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 520));
      await page.waitForTimeout(400);
    },
  },
  // PF-008: chapter stops are not listed here; any `<chapter>:<start|mid|end>` argument is one
  // (resolveTargets below), optionally limited to one viewport with `@desktop` / `@phone`.
};

/** The asset lab loaded, framed (`overview` | `shader` | `top`), the clip at `clip`, scrolled to the canvas. */
async function assetLab(page, { view, clip = 0 }) {
  await page.waitForFunction(() => window.__assetLab?.snapshot().state === "loaded", null, { timeout: 60_000 });
  await page.evaluate(({ v, c }) => {
    window.__assetLab.view(v);
    window.__assetLab.scrub(c);
  }, { v: view, c: clip });
  await page.locator("[data-asset-lab-canvas]").evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 88));
  // OrbitControls damping and the 4 Hz readouts settle.
  await page.waitForTimeout(1500);
}

export const DEFAULT_TARGETS = ["/"];

// ---------------------------------------------------------------------------------------------
// Chapter stops (PF-008)

/** The chapters in registry order (src/lib/journey/chapters.ts – the live registry decides at capture time). */
export const CHAPTER_IDS = ["port", "bus", "memory", "array", "core", "uplink"];
export const STOP_POINTS = ["start", "mid", "end"];
const STOP_PATTERN = /^([a-z]+):(start|mid|end)(?:@(desktop|phone))?$/;

/**
 * Scrolls the home page to a chapter stop, resolved from the live registry and the measured
 * sections (`window.__journey.scroll()`): start = the chapter's start + 1 px; mid = halfway to the
 * next chapter's start (the page end for the last); end = the next chapter's start − 1 px, or the
 * page end. Waits for the store and for the camera to arrive (the eased mode needs a moment), then
 * returns where it landed.
 * @param {import("@playwright/test").Page} page
 */
export async function scrollToChapterStop(page, chapter, point) {
  await page.waitForFunction(() => window.__journey?.ready === true && window.__journey.scroll?.()?.active === true && !!window.__journey.rig, null, {
    timeout: 60_000,
  });
  const y = await page.evaluate(
    ([c, p]) => {
      const s = window.__journey.scroll();
      const i = s.chapters.indexOf(c);
      if (i < 0) throw new Error(`no chapter ${c} in the registry (${s.chapters.join(", ")})`);
      const start = s.boundaries[i];
      const next = i + 1 < s.boundaries.length ? s.boundaries[i + 1] : s.max;
      const last = i + 1 >= s.boundaries.length;
      const y = p === "start" ? start + 1 : p === "mid" ? (start + next) / 2 : last ? s.max : next - 1;
      return Math.round(Math.min(s.max, Math.max(0, y)));
    },
    [chapter, point],
  );
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
  await page.waitForFunction(
    (top) => {
      const s = window.__journey?.scroll?.();
      const r = window.__journey?.rig?.();
      if (!s || !r || Math.abs(window.scrollY - top) > 1) return false;
      const expected = s.max > 0 ? (window.scrollY >= s.max - 0.5 ? 1 : window.scrollY / s.max) : 0;
      return Math.abs(s.progress - expected) < 1e-9 && Math.abs(r.frame - r.targetFrame) < 0.01;
    },
    y,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(500);
  const s = await page.evaluate(() => window.__journey.scroll());
  if (s.chapter !== chapter) throw new Error(`${chapter}:${point} landed in chapter ${s.chapter} (scroll ${s.scrollY})`);
  return { scrollY: s.scrollY, chapter: s.chapter, progress: s.progress, chapterProgress: s.chapterProgress };
}

/** A chapter stop as a capture target (on `?tier=high`; review-shots adds `?gpu=low-power`). */
function chapterStopTarget(arg) {
  const m = STOP_PATTERN.exec(arg);
  if (!m || !CHAPTER_IDS.includes(m[1])) return null;
  const [, chapter, point, only] = m;
  return {
    name: `${chapter}-${point}`,
    path: "/?tier=high",
    viewports: only ? VIEWPORTS.filter((v) => v.name === only) : undefined,
    prepare: async (page) => {
      await waitForCanvas(page);
      await scrollToChapterStop(page, chapter, point);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The canvas (PF-007)

/** Waits until the canvas has drawn and faded in (and the scene had a moment to turn). */
export async function waitForCanvas(page) {
  await page.waitForFunction(() => window.__journey?.ready === true, null, { timeout: 60_000 });
  await page.locator("[data-journey-host][data-shown]").waitFor({ state: "attached" });
  await page.waitForTimeout(900);
}

/** Waits for the static tier (with the expected reason) and the hero still to be drawn. */
async function waitForStatic(page, reason) {
  await page.waitForFunction((r) => window.__journey?.state().tier === "static" && window.__journey.state().reason === r, reason, { timeout: 30_000 });
  await page.waitForFunction(() => {
    const img = document.querySelector("section#top picture img");
    return !!img && img.complete && img.naturalWidth > 0;
  });
  await page.waitForTimeout(300);
}

/**
 * Stops for `npm run numbers`: where the scene is measured. A stop is a route plus an optional
 * `prepare(page)`. PF-008: every `<chapter>:<start|mid|end>` is a stop on `/` – scrolled there
 * after the canvas is up, resolved from the live registry (scrollToChapterStop).
 * @type {Record<string, { path: string, prepare?: (page: import("@playwright/test").Page) => Promise<unknown> }>}
 */
export const NUMBER_STOPS = {
  // The PF-007 test object behind the hero, at the top of the page.
  "/": { path: "/" },
  ...Object.fromEntries(
    CHAPTER_IDS.flatMap((chapter) =>
      STOP_POINTS.map((point) => [`${chapter}:${point}`, { path: "/", prepare: (page) => scrollToChapterStop(page, chapter, point) }]),
    ),
  ),
};

/** Every chapter's middle, plus the first and the last screen of the page. */
export const DEFAULT_STOPS = ["port:start", ...CHAPTER_IDS.map((c) => `${c}:mid`), "uplink:end"];

/** Command-line stops → stop objects. */
export function resolveStops(args) {
  const list = args.length ? args : DEFAULT_STOPS;
  return list.map((name) => {
    const stop = NUMBER_STOPS[name];
    if (!stop) throw new Error(`Unknown stop "${name}". Known: ${Object.keys(NUMBER_STOPS).join(", ")}.`);
    return { name, ...stop };
  });
}

// ---------------------------------------------------------------------------------------------
// Contact flow helpers (PF-019)

/** Waits until the flow's script runs (Next is disabled before), then brings it into view. */
async function openContactFlow(page) {
  await page.getByRole("button", { name: /Next/ }).waitFor();
  await page.waitForFunction(() => !document.querySelector("#contact form button[type=submit]")?.disabled);
}

/** Picks an option by its chip, as a person does. */
async function chooseOption(page, name) {
  await page
    .locator("#contact label")
    .filter({ has: page.getByRole("radio", { name, exact: true }) })
    .click();
}

/** Scrolls the flow's panel to the top of the screen and lets the step animation finish. */
async function settleOnFlow(page) {
  await page.evaluate(() => document.querySelector("#contact form")?.closest(".rounded-sm")?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(700);
}

/** Walks the Hiring path to step `upTo` (0 = intent … 5 = review, 6 = sent with the send mocked). */
async function contactFlow(page, upTo) {
  await openContactFlow(page);
  const steps = [
    async () => {
      await chooseOption(page, "Hiring for a role");
      await page.getByRole("heading", { name: "Kind of role" }).waitFor();
    },
    async () => {
      await chooseOption(page, "Full-time");
      await page.getByRole("heading", { name: "Work mode" }).waitFor();
    },
    async () => {
      await chooseOption(page, "Remote");
      await page.getByRole("heading", { name: "Where can I reply?" }).waitFor();
      await page.getByRole("textbox", { name: "Your name" }).fill("Review Example");
      await page.getByRole("textbox", { name: "Your email" }).fill("review@example.com");
    },
    async () => {
      await page.getByRole("button", { name: /Next/ }).click();
      await page.getByRole("heading", { name: "Your message" }).waitFor();
    },
    async () => {
      await page.getByRole("button", { name: /Next/ }).click();
      await page.getByRole("heading", { name: "Ready to transmit?" }).waitFor();
    },
    async () => {
      await page.route("**/api/contact", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
      await page.getByRole("button", { name: "Transmit" }).click();
      await page.getByRole("heading", { name: "Transmission received" }).waitFor();
    },
  ];
  for (const step of steps.slice(0, upTo)) await step();
  await settleOnFlow(page);
}

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
    const stop = chapterStopTarget(arg);
    if (stop) return stop;
    const named = NAMED_TARGETS[arg];
    if (!named) {
      const known = Object.keys(NAMED_TARGETS);
      throw new Error(
        `Unknown target "${arg}". Use a route starting with "/", a chapter stop <chapter>:<start|mid|end>[@desktop|@phone] ` +
          `(chapters: ${CHAPTER_IDS.join(", ")})` +
          (known.length ? ` or one of: ${known.join(", ")}` : "") +
          ".",
      );
    }
    return { name: arg, ...named };
  });
}
