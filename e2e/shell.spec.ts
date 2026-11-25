import { expect, type Page, test } from "./fixtures";

const NAV_TARGETS = ["Work", "About", "Experience", "Skills", "Contact", "Resume", "Simple view"];
// Phones: Work and Resume are quick links in the header (one tap away), before the menu button;
// the menu holds the rest.
const PHONE_NAV_TARGETS = ["Work", "Resume", "About", "Experience", "Skills", "Contact", "Simple view"];

type FocusInfo = {
  name: string;
  tag: string;
  expanded: string | null;
  outlineStyle: string;
  outlineWidth: number;
  outlineColor: string;
  visible: boolean;
};

function readFocus(page: Page): Promise<FocusInfo | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      name: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim(),
      tag: el.tagName.toLowerCase(),
      expanded: el.getAttribute("aria-expanded"),
      outlineStyle: cs.outlineStyle,
      outlineWidth: parseFloat(cs.outlineWidth),
      outlineColor: cs.outlineColor,
      visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight,
    };
  });
}

test.describe("keyboard path through the shell", () => {
  test("Tab from the skip link reaches every nav target and the switch, with focus always visible", async ({
    page,
    isMobile,
  }) => {
    const targets = isMobile ? PHONE_NAV_TARGETS : NAV_TARGETS;
    await page.goto("/");
    await page.keyboard.press("Tab");
    const first = await readFocus(page);
    expect(first?.name).toBe("Skip to content");

    const reached: string[] = [];
    for (let i = 0; i < 30 && !targets.every((t) => reached.includes(t)); i++) {
      const focus = await readFocus(page);
      expect(focus, `step ${i}: something has focus`).not.toBeNull();
      // One focus style everywhere: 2 px solid accent-signal (#cff6ff = rgb(207, 246, 255)).
      expect(focus!.outlineStyle, `step ${i} (${focus!.name})`).toBe("solid");
      expect(focus!.outlineWidth, `step ${i} (${focus!.name})`).toBeGreaterThanOrEqual(2);
      // Colour transitions (duration-fast) include outline-color: wait for it to settle.
      await expect
        .poll(async () => (await readFocus(page))?.outlineColor, { message: `step ${i} (${focus!.name})`, timeout: 2000 })
        .toBe("rgb(207, 246, 255)");
      expect(focus!.visible, `step ${i} (${focus!.name}) is on screen`).toBe(true);
      reached.push(focus!.name);
      // Phone layout: the links sit behind the menu button – open it with the keyboard.
      if (focus!.name === "Menu" && focus!.expanded === "false") await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");
    }
    // In this order.
    const order = targets.map((t) => reached.indexOf(t));
    expect(order.every((idx) => idx >= 0), `reached: ${reached.join(" → ")}`).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("the skip link moves focus to the main content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  });

  test("the phone menu closes on Escape and returns focus to its button", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the menu button only exists below the lg breakpoint");
    await page.goto("/");
    const button = page.getByRole("button", { name: "Menu" });
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("link", { name: "About" })).toBeVisible();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Escape");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();
    await expect(page.getByRole("link", { name: "About" })).toBeHidden();
  });
});

test.describe("dev-only pages", () => {
  test.skip(process.env.ENABLE_DEV_PAGES === "1", "this build was made with ENABLE_DEV_PAGES=1");

  for (const route of ["/dev/styleguide", "/dev/type"]) {
    test(`${route} returns 404 without ENABLE_DEV_PAGES`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(404);
    });
  }
});

test.describe("layout from 360 to 1920 px", () => {
  test.skip(({ isMobile }) => isMobile, "sets its own viewport; runs once, in the desktop project");

  test("360 px (= 200 % zoom on a 720 px window): no horizontal scroll, menu collapsed", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/");
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
    await expect(page.getByRole("link", { name: "About" })).toBeHidden();
    // Work and Resume stay in the header, one tap away.
    await expect(page.getByRole("banner").getByRole("link", { name: "Work", exact: true })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Resume", exact: true })).toBeVisible();
  });

  test("1920 px: no horizontal scroll, navigation inline", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
    for (const name of NAV_TARGETS.slice(0, 6)) {
      await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Simple view" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the navigation links are shown and usable", async ({ page }) => {
    await page.goto("/");
    for (const name of NAV_TARGETS.slice(0, 6)) {
      await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("stops the ambient status pulse and hides its ring; the dot stays lit", async ({ page }) => {
    await page.goto("/");
    const pulse = page.locator("[data-status-pulse]").first();
    expect(await pulse.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    expect(await pulse.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
    const dot = await pulse.evaluate((el) => getComputedStyle(el.nextElementSibling as Element).backgroundColor);
    expect(dot).toBe("rgb(207, 246, 255)");
  });
});

test.describe("status chip", () => {
  test("the dot is the signal accent with a soft pulse", async ({ page }) => {
    await page.goto("/");
    const pulse = page.locator("[data-status-pulse]").first();
    expect(await pulse.evaluate((el) => getComputedStyle(el).animationName)).toBe("signal-pulse");
    const dot = await pulse.evaluate((el) => getComputedStyle(el.nextElementSibling as Element).backgroundColor);
    expect(dot).toBe("rgb(207, 246, 255)");
  });
});
