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
  dynamicRouteSamples: {},

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
