import { expect, test } from "@playwright/test";
import { NOINDEX_DIRECTIVE, SITE_LAUNCHED } from "../src/config/site";

// Linked from the navigation but built later; Next's <Link> prefetch gets a 404 for them.
// PF-006 builds /work and /resume – empty this list then.
const NOT_YET_BUILT = ["/work", "/resume"];

test.describe("home page smoke", () => {
  test("loads with status 200 and no console or page errors", async ({ page }) => {
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
      if (res.status() < 400) return;
      const { pathname } = new URL(res.url());
      if (res.status() === 404 && NOT_YET_BUILT.includes(pathname)) return;
      failed.push(`${res.status()} ${pathname}`);
    });
    page.on("requestfailed", (req) => failed.push(`failed ${req.url()}`));

    const response = await page.goto("/", { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    // Let hydration and any late scripts run before judging the console.
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
    expect(failed).toEqual([]);
  });

  test("has a main landmark and exactly one h1", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });

  test("sends the robots header that matches the launch switch", async ({ page }) => {
    const response = await page.goto("/");
    const header = response?.headers()["x-robots-tag"];
    if (SITE_LAUNCHED) {
      expect(header).toBeUndefined();
    } else {
      expect(header).toBe(NOINDEX_DIRECTIVE);
    }
  });
});

test("an unknown route returns 404", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist");
  expect(response?.status()).toBe(404);
});
