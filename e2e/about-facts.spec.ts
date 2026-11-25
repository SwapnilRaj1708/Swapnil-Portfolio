import { expect, test } from "./fixtures";
import { identity } from "../src/content/data/identity";

// The facts readout beside the About text (PF-029, D-38): where it sits at each width, what a
// screen reader gets, and that it stays inside the page.

const WIDTHS = [360, 390, 768, 1023, 1024, 1280, 1440, 1920];

test.describe("About facts readout", () => {
  test("sits beside the text from 1024 px and below it on narrower screens", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "window sizes are set here; the phone project has its own");
    // Where the 3D layer is built in (PF-007) every resize also resizes the canvas, rendered in
    // software on test machines: under a full parallel run this took longer than 30 s.
    test.setTimeout(60_000);
    // The layout is CSS only, so one load and a resize per width is enough (eight loads of `/`
    // with its stills ran past the test timeout when every worker was busy).
    await page.goto("/");
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const about = page.locator("section#about");
      const lastBeat = about.locator("p", { hasText: "I like the problems underneath the UI" });
      const facts = about.locator("[data-about-facts]");
      await facts.scrollIntoViewIfNeeded();
      const text = await lastBeat.boundingBox();
      const box = await facts.boundingBox();
      expect(text, `last beat at ${width}`).not.toBeNull();
      expect(box, `readout at ${width}`).not.toBeNull();
      if (!text || !box) continue;
      if (width >= 1024) {
        expect(box.x, `readout right of the text at ${width}`).toBeGreaterThanOrEqual(text.x + text.width);
      } else {
        expect(box.y, `readout below the text at ${width}`).toBeGreaterThanOrEqual(text.y + text.height);
      }
      expect(box.x + box.width, `readout inside the window at ${width}`).toBeLessThanOrEqual(width);
      console.log(`[about facts] ${width}px: ${width >= 1024 ? "beside" : "below"} (${Math.round(box.width)} × ${Math.round(box.height)} px)`);
    }
  });

  test("is a description list with the four rows from the content", async ({ page }) => {
    await page.goto("/");
    const list = page.locator("section#about [data-about-facts] dl");
    await expect(list.locator("dt")).toHaveText(["Role", "Based in", "Status", "Core stack"]);
    await expect(list.locator("dd")).toHaveText([
      identity.role,
      `${identity.location} · ${identity.timeZone}`,
      identity.availability,
      "React · Next.js · TypeScript",
    ]);
    // Labels render upper-case (label-mono) but are read as written.
    await expect(list.locator("dt").first()).toHaveCSS("text-transform", "uppercase");
    await expect(list.locator("[data-status-dot]")).toBeVisible();
  });
});
