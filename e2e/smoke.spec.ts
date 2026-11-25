import { expect, test } from "./fixtures";
import { NOINDEX_DIRECTIVE, SITE_PUBLIC, SITE_URL } from "../src/config/site";
import { projects } from "../src/content/data/projects";

// Every page route of the site. PF-006 built /work and /resume, so no route is allowed to 404
// any more (the PF-005 NOT_YET_BUILT allowlist is gone).
const ROUTES = [
  "/",
  "/work",
  ...projects.map((p) => `/work/${p.slug}`),
  "/resume",
  // Result pages of the plain contact form (PF-019).
  ...["sent", "invalid", "rate-limited", "failed"].map((s) => `/contact/result/${s}`),
];

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

// The launch switch (src/config/site.ts): the build under test is public only when it was made as
// the Vercel production deployment (VERCEL_ENV=production); the web server and this file share
// the environment, so SITE_PUBLIC here is the build's state. A normal local or CI run is not public.
test.describe(`launch switch as built (${SITE_PUBLIC ? "public" : "not public"})`, () => {
  test("robots header and meta tag match", async ({ page }) => {
    for (const route of ["/", "/work", "/work/twizzr", "/resume"]) {
      const response = await page.goto(route);
      const header = response?.headers()["x-robots-tag"];
      const meta = page.locator('meta[name="robots"]');
      if (SITE_PUBLIC) {
        expect(header).toBeUndefined();
        await expect(meta).toHaveCount(0);
      } else {
        expect(header).toBe(NOINDEX_DIRECTIVE);
        await expect(meta).toHaveAttribute("content", "noindex, nofollow");
      }
    }
  });

  test("robots.txt matches", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    if (SITE_PUBLIC) {
      expect(body).toMatch(/Allow: \/\s/);
      expect(body).not.toMatch(/Disallow/);
      expect(body).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
    } else {
      expect(body).toMatch(/Disallow: \/\s/);
      expect(body).not.toMatch(/Sitemap/);
    }
  });

  test("every page has its own canonical link on the site's address", async ({ page }) => {
    const pages = ["/", "/work", ...projects.map((p) => `/work/${p.slug}`), "/resume"];
    for (const route of pages) {
      await page.goto(route);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", route === "/" ? SITE_URL : `${SITE_URL}${route}`);
    }
  });

  test("social image URLs use the site's address", async ({ page }) => {
    await page.goto("/work");
    const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
    expect(og).toMatch(new RegExp(`^${SITE_URL.replaceAll(".", "\\.")}/work/opengraph-image`));
  });
});

test("the sitemap lists every public page and nothing else", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const locs = [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs).toEqual([
    SITE_URL,
    `${SITE_URL}/work`,
    ...[...projects].sort((a, b) => a.order - b.order).map((p) => `${SITE_URL}/work/${p.slug}`),
    `${SITE_URL}/resume`,
  ]);
});

test("the 404 page has no canonical link", async ({ page }) => {
  await page.goto("/this-route-does-not-exist");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test("an unknown route returns 404", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist");
  expect(response?.status()).toBe(404);
});
