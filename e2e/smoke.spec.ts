import { expect, test } from "@playwright/test";
import { NOINDEX_DIRECTIVE, SITE_LAUNCHED } from "../src/config/site";

test.describe("home page smoke", () => {
  test("loads with status 200 and no console or page errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
    });
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

    const response = await page.goto("/", { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    // Let hydration and any late scripts run before judging the console.
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
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
