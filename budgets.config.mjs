// Budgets checked by the repo's scripts. Values come from STANDARDS.md §3 –
// change them only with the owner's approval (a budget change is an owner decision).
// Later items add their limits here (the lazy 3D chunk, chapter assets, the whole journey).

/** 1 KB = 1000 bytes, as in the budget tables. */
export const KB = 1000;

export const budgets = {
  // `npm run size`: JavaScript the served HTML of each route loads (compressed transfer size).
  // Gated on gzip (larger, so stricter than Brotli); Brotli is printed for information.
  firstLoadJs: {
    gzipBytes: 200 * KB,
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

  // `npm run lighthouse`: mobile scores (0–100), median of 3 runs, fast-lane pages.
  lighthouse: {
    runs: 3,
    minScores: {
      performance: 90,
      accessibility: 95,
      "best-practices": 95,
      seo: 95,
    },
  },
};
