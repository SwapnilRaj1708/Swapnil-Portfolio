// Capture targets for `npm run review:shots`.
//
// A target is a named place to photograph: a route, plus an optional `prepare(page)` step that
// moves the page into position (PF-008 adds chapter stops here, e.g. scroll to a chapter's
// start, middle and end and wait for the scene to settle).
//
// On the command line, an argument that starts with "/" is a route; anything else must be a
// name in NAMED_TARGETS.

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
  // Chapter stops are added by PF-008, for example:
  // "port-start": { path: "/", prepare: async (page) => { /* scroll to the start of `port` */ } },
};

export const DEFAULT_TARGETS = ["/"];

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
