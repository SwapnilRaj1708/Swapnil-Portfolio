// Budgets checked by the repo's scripts. Values come from STANDARDS.md §3 –
// change them only with the owner's approval (a budget change is an owner decision).
// Later items add their limits here (chapter assets, the whole journey).

/** 1 KB = 1000 bytes, as in the budget tables. */
export const KB = 1000;

export const budgets = {
  // `npm run size`: JavaScript the served HTML of each route loads (compressed transfer size).
  // Gated on gzip (larger, so stricter than Brotli); Brotli is printed for information.
  firstLoadJs: {
    gzipBytes: 200 * KB,
  },

  // `npm run size` (PF-007, PF-008): the lazy journey chunks – every JavaScript file the canvas
  // loader pulls in after the page is interactive (three, React Three Fiber, the scene, and since
  // PF-008 the scroll spine's gsap + ScrollTrigger + Lenis and the camera rig), summed. Gzip, like
  // first-load JS. First-load JS of every route must contain none of them.
  threeDChunk: {
    gzipBytes: 400 * KB,
  },

  // Dynamic routes cannot be fetched without a real path. Give each one sample paths here,
  // e.g. { "/work/[slug]": ["/work/example"] }. A dynamic route without samples fails the report.
  dynamicRouteSamples: {
    // One case study with an image, one without.
    "/work/[slug]": ["/work/twizzr", "/work/softboard-lite"],
    // Result pages of the plain contact form (PF-019): all share one template.
    "/contact/result/[status]": ["/contact/result/sent"],
  },

  // `npm run size`: total transfer of a fast-lane page without video (STANDARDS.md §3: ≤ 1 MB) –
  // every request the page makes in a browser (HTML, JS, CSS, fonts, images, prefetches) after
  // scrolling to the bottom so lazy images load, on the desktop and the phone viewport.
  pageWeight: {
    bytes: 1000 * KB,
    routes: ["/work", "/work/twizzr", "/resume"],
    // Measured and printed, not gated: the home page is the journey route (its 3D budgets apply).
    reportOnly: ["/"],
  },

  // `npm run size`: the stage 1 stills (PF-028, item table: ≤ 250 KB each at the largest size
  // served). They are drawn full-bleed, so the largest size is the master's full width (next/image
  // never enlarges); measured as served by next/image, in AVIF and in WebP.
  stills: {
    dir: "public/media/stills",
    maxServedBytes: 250 * KB,
  },

  // `npm run lighthouse`: mobile scores (0–100), median of 3 runs, fast-lane pages.
  // With `-- --applied` (real slow 4G and 4× CPU instead of the simulation) LCP is also gated:
  // D-32 – on routes whose LCP is an image, LCP ≤ 2.5 s is checked with applied throttling.
  lighthouse: {
    runs: 3,
    minScores: {
      performance: 90,
      accessibility: 95,
      "best-practices": 95,
      seo: 95,
    },
    /** Page experience (STANDARDS.md §3): CLS always; LCP gated in the applied-throttling run. */
    maxCls: 0.05,
    maxLcpMs: 2500,
  },
};
