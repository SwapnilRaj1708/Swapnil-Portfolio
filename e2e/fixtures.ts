import { test as base, expect, type Page, type Route } from "@playwright/test";
import { IS_PRODUCTION_DEPLOYMENT } from "../src/config/site";

/**
 * The `test` every spec uses: Playwright's, plus one automatic fixture.
 *
 * Vercel's scripts in a production build. A build made with VERCEL_ENV=production renders Vercel
 * Web Analytics and Speed Insights (`SiteAnalytics`), whose scripts load from the site's own
 * `/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js`. Vercel's edge serves
 * those paths; `next start` does not, so locally every page would log two failed requests. In a
 * production build only (the test process shares the build's VERCEL_ENV, like SITE_PUBLIC in
 * smoke.spec.ts), every browser context answers exactly those two path prefixes on the site's own
 * origin with an empty JavaScript file (200), so the analytics do nothing and send nothing. Every
 * other request – any other `/_vercel/…` path or any other origin included – is untouched, so a
 * real failed request still fails its test. Normal (non-production) builds never render the
 * scripts and get no route at all.
 */

/** Exactly the two script paths, on any origin's path (the context only talks to the test server). */
export const VERCEL_SCRIPT_PATH = /^\/_vercel\/(insights|speed-insights)\//;

export const test = base.extend<{ vercelScripts: void }>({
  vercelScripts: [
    async ({ context, baseURL }, use) => {
      if (IS_PRODUCTION_DEPLOYMENT) {
        const origin = new URL(baseURL!).origin;
        await context.route(
          (url) => url.origin === origin && VERCEL_SCRIPT_PATH.test(url.pathname),
          (route: Route) => route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: "" }),
        );
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect, type Page };
