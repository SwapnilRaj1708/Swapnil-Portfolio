import { expect, test } from "@playwright/test";
import { NOINDEX_DIRECTIVE, SITE_LAUNCHED } from "../src/config/site";
import { projects } from "../src/content/data/projects";

// Every page route of the site. PF-006 built /work and /resume, so no route is allowed to 404
// any more (the PF-005 NOT_YET_BUILT allowlist is gone).
const ROUTES = ["/", "/work", ...projects.map((p) => `/work/${p.slug}`), "/resume"];

test.describe("every route", () => {
  for (const route of ROUTES) {
    test(`${route} loads with status 200, no console or page errors and no failed requests`, async ({ page }) => {
      const errors: string[] = [];
      const failed: string[] = [];
      page.on("console", (msg) => {
        // A failed request also logs "Failed to load resource"; those are judged by URL below.
        if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource")) {
          errors.push(`console: ${msg.text()}`);
        }
      });
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      page.on("response", (res) => {
        if (res.status() >= 400) failed.push(`${res.status()} ${new URL(res.url()).pathname}`);
      });
      page.on("requestfailed", (req) => failed.push(`failed ${req.url()}`));

      const response = await page.goto(route, { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      // Let hydration, lazy images and prefetches run before judging.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForLoadState("networkidle");
      expect(errors).toEqual([]);
      expect(failed).toEqual([]);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    });
  }
});

test("sends the robots header that matches the launch switch", async ({ page }) => {
  for (const route of ["/", "/work", "/resume"]) {
    const response = await page.goto(route);
    const header = response?.headers()["x-robots-tag"];
    if (SITE_LAUNCHED) {
      expect(header).toBeUndefined();
    } else {
      expect(header).toBe(NOINDEX_DIRECTIVE);
    }
  }
});

test("an unknown route returns 404", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist");
  expect(response?.status()).toBe(404);
});
