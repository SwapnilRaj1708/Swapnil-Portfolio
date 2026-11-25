import { expect, type Page, test } from "./fixtures";
import { experience, education, skills, services } from "../src/content/data/career";
import { about, identity } from "../src/content/data/identity";
import { projects } from "../src/content/data/projects";

// The fast lane (BRIEF.md §2, §5): /work, /work/<slug>, /resume – plus the home page's static
// sections and the styled 404. Runs on the desktop and phone projects.

const twizzr = projects.find((p) => p.slug === "twizzr")!;
const featured = projects.filter((p) => p.featured);
const PAGES = ["/", "/work", "/work/twizzr", "/work/recall", "/resume", "/no-such-page", "/work/no-such-project"];

test.describe("10-second rule", () => {
  test("name, role and pitch are in the server-rendered HTML of /", async ({ request }) => {
    const html = await (await request.get("/")).text();
    expect(html).toMatch(new RegExp(`<h1[^>]*>${identity.name}</h1>`));
    expect(html).toContain(identity.role);
    expect(html).toContain(identity.pitch);
    expect(html).toContain(identity.availability);
  });

  for (const route of PAGES) {
    test(`Work and Resume are one action away on ${route}`, async ({ page }) => {
      await page.goto(route);
      const banner = page.getByRole("banner");
      // Visible in the header without opening anything (phones included).
      await expect(banner.getByRole("link", { name: "Work", exact: true })).toBeVisible();
      await expect(banner.getByRole("link", { name: "Work", exact: true })).toHaveAttribute("href", "/work");
      await expect(banner.getByRole("link", { name: "Resume", exact: true })).toBeVisible();
      await expect(banner.getByRole("link", { name: "Resume", exact: true })).toHaveAttribute("href", "/resume");
    });
  }
});

test.describe("not found", () => {
  for (const route of ["/no-such-page", "/work/no-such-project"]) {
    test(`${route} answers 404 with the styled page inside the shell`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
      await expect(page.getByRole("banner")).toBeVisible();
      await expect(page.getByRole("contentinfo")).toBeVisible();
      await expect(page.getByRole("main").getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
      // The site's own background, not the browser's white default.
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).toBe("rgb(7, 9, 12)");
      expect(await page.title()).toContain("Page not found");
    });
  }
});

/** Tabs through the whole page; returns the href of every link that received focus. */
async function tabThrough(page: Page) {
  const reached = new Set<string>();
  let previous: string | null = null;
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return {
        key: `${el.tagName}|${el.getAttribute("href")}|${el.textContent?.trim()}`,
        href: el.getAttribute("href"),
        outline: cs.outlineStyle,
      };
    });
    if (!focus) break;
    if (focus.key === previous) break;
    expect(focus.outline, `focus visible on ${focus.key}`).toBe("solid");
    if (focus.href) reached.add(focus.href);
    // The footer's last link ends the page.
    if (focus.href?.includes("linkedin.com")) break;
    previous = focus.key;
  }
  return reached;
}

test.describe("keyboard", () => {
  for (const route of ["/work", "/work/twizzr"]) {
    test(`Tab reaches every link on ${route}, each with a visible focus style`, async ({ page, isMobile }) => {
      await page.goto(route);
      const expected = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLAnchorElement>("main a[href]")]
          .filter((a) => a.getClientRects().length > 0)
          .map((a) => a.getAttribute("href")!),
      );
      expect(expected.length).toBeGreaterThan(2);
      const reached = await tabThrough(page);
      for (const href of expected) expect(reached, `${href} reached by Tab (${isMobile ? "phone" : "desktop"})`).toContain(href);
    });
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("/ shows every section's content", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: identity.name })).toBeVisible();
    await expect(page.getByText(identity.pitch)).toBeVisible();
    for (const beat of about.beats) await expect(page.getByText(beat)).toBeVisible();
    for (const role of experience) await expect(page.getByRole("heading", { name: role.title })).toBeVisible();
    for (const p of featured) await expect(page.getByRole("link", { name: p.name, exact: true })).toBeVisible();
    for (const group of skills) for (const item of group.items) await expect(page.getByText(item, { exact: true }).first()).toBeVisible();
    for (const s of services) await expect(page.getByText(s.line)).toBeVisible();
    await expect(page.locator("#contact").getByRole("link", { name: identity.email })).toBeVisible();
  });

  test("/work lists all eight projects with their images", async ({ page }) => {
    await page.goto("/work");
    for (const p of projects) await expect(page.getByRole("link", { name: p.name, exact: true })).toBeVisible();
    for (const p of projects.filter((x) => x.media.length)) {
      const img = page.getByRole("img", { name: p.media[0].alt });
      await img.scrollIntoViewIfNeeded();
      await expect(img).toBeVisible();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    }
  });

  test("a case study shows problem, role, approach, outcome, stack and links", async ({ page }) => {
    await page.goto("/work/twizzr");
    await expect(page.getByRole("heading", { level: 1, name: "Twizzr" })).toBeVisible();
    for (const text of [twizzr.problem, twizzr.role, ...twizzr.approach, ...twizzr.outcome!, ...twizzr.stack]) {
      await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole("link", { name: /^Live site/ })).toHaveAttribute("href", twizzr.links.live);
    await expect(page.getByRole("img", { name: "Homepage of Twizzr" })).toBeVisible();
  });

  test("/resume shows experience, education, skills and the PDF link", async ({ page }) => {
    await page.goto("/resume");
    for (const role of experience) await expect(page.getByRole("heading", { name: role.title })).toBeVisible();
    for (const e of education) await expect(page.getByText(e.degree)).toBeVisible();
    for (const group of skills) await expect(page.getByRole("heading", { name: group.name })).toBeVisible();
    const pdf = page.getByRole("link", { name: /Download the PDF/ });
    await expect(pdf).toHaveAttribute("href", "/resume/swapnil-raj-resume.pdf");
  });
});

test.describe("project screens", () => {
  const filterOf = (page: Page, alt: string) =>
    page.getByRole("img", { name: alt }).evaluate((el) => getComputedStyle(el).filter);

  /** Presses Tab until the card link to `href` has keyboard focus. */
  async function tabTo(page: Page, href: string) {
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate((h) => document.activeElement?.getAttribute("href") === h, href)) return;
    }
    throw new Error(`Tab never reached ${href}`);
  }

  test("a screenshot rests dimmed and lifts to full brightness on keyboard focus of its card", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "dimming is for devices that can hover");
    await page.goto("/work");
    await page.mouse.move(0, 0);
    const alt = twizzr.media[0].alt;
    await expect.poll(() => filterOf(page, alt)).toMatch(/^brightness\(0\.\d+\)$/);
    await tabTo(page, "/work/twizzr");
    await expect.poll(() => filterOf(page, alt)).toBe("none");
    // Focus moves on to the next card: Twizzr dims again.
    await page.keyboard.press("Tab");
    await expect.poll(() => filterOf(page, alt)).toMatch(/^brightness\(0\.\d+\)$/);
  });

  test("under reduced motion the screenshot lifts at once (no transition), same end state", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "dimming is for devices that can hover");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/work");
    await page.mouse.move(0, 0);
    const img = page.getByRole("img", { name: twizzr.media[0].alt });
    const states = await img.evaluate((el) => {
      const before = getComputedStyle(el).filter;
      (el.closest("article")!.querySelector("a") as HTMLAnchorElement).focus();
      return { before, after: getComputedStyle(el).filter, transition: getComputedStyle(el).transitionProperty };
    });
    expect(states.before).toMatch(/^brightness\(0\.\d+\)$/);
    expect(states.after).toBe("none");
    expect(states.transition).not.toContain("filter");
  });

  test("on a touch screen (no hover) card screenshots are never dimmed", async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "touch only");
    await page.goto("/work");
    expect(await page.evaluate(() => matchMedia("(hover: none)").matches || matchMedia("(pointer: coarse)").matches)).toBe(true);
    const images = page.locator("article img");
    expect(await images.count()).toBe(projects.filter((p) => p.media.length).length);
    expect(await images.evaluateAll((els) => els.map((el) => getComputedStyle(el).filter))).toEqual(
      Array(await images.count()).fill("none"),
    );
  });

  test("a case study without media shows the readout tile as a short band (≤ 240 px on desktop)", async ({ page }, info) => {
    await page.goto("/work/softboard-lite");
    const band = page.locator(".min-h-readout-band");
    await expect(band).toBeVisible();
    const { width, height } = (await band.boundingBox())!;
    expect(height).toBeLessThan(width / 2);
    if (info.project.name === "desktop") expect(height).toBeLessThanOrEqual(241);
    else expect(height).toBeLessThanOrEqual(200);
  });

  test("projects without a public preview show the readout tile, on /work and the case study", async ({ page }) => {
    for (const p of projects.filter((x) => x.noPublicPreview)) {
      await page.goto(`/work/${p.slug}`);
      await expect(page.getByText("Preview · behind sign-in")).toBeVisible();
    }
    await page.goto("/work");
    await expect(page.getByText("Preview · behind sign-in")).toHaveCount(projects.filter((x) => x.noPublicPreview).length);
  });

  for (const route of ["/", "/work"]) {
    test(`cards in one row on ${route} have equal heights and their actions line up`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "one column on phones");
      await page.goto(route);
      const boxes = await page.locator("article:has(a[href^='/work/'])").evaluateAll((cards) =>
        cards.map((card) => {
          const r = card.getBoundingClientRect();
          const action = card.querySelector(":scope p[aria-hidden='true']:last-child")!.getBoundingClientRect();
          return { top: Math.round(r.top + scrollY), height: r.height, actionBottom: Math.round(action.bottom + scrollY) };
        }),
      );
      const rows = Map.groupBy(boxes, (b) => b.top);
      let pairs = 0;
      for (const row of rows.values()) {
        if (row.length < 2) continue;
        pairs++;
        for (const b of row) {
          expect(Math.abs(b.height - row[0].height)).toBeLessThanOrEqual(1);
          expect(Math.abs(b.actionBottom - row[0].actionBottom)).toBeLessThanOrEqual(1);
        }
      }
      expect(pairs).toBeGreaterThan(0);
    });
  }
});

test.describe("page details", () => {
  test("every page has its own title", async ({ page }) => {
    const titles = new Map<string, string>();
    for (const route of ["/", "/work", ...projects.map((p) => `/work/${p.slug}`), "/resume"]) {
      await page.goto(route);
      titles.set(route, await page.title());
    }
    expect(new Set(titles.values()).size, JSON.stringify(Object.fromEntries(titles))).toBe(titles.size);
    expect(titles.get("/work/twizzr")).toBe("Twizzr – Swapnil Raj");
  });

  test("the resume PDF is served", async ({ request }) => {
    const res = await request.get("/resume/swapnil-raj-resume.pdf");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
  });

  for (const route of ["/", "/work", "/work/twizzr"]) {
    test(`no layout shift while ${route} and its images load (CLS ≤ 0.05)`, async ({ page }) => {
      await page.goto(route);
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
      });
      await page.waitForLoadState("networkidle");
      const cls = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            let total = 0;
            new PerformanceObserver((list) => {
              for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
                if (!e.hadRecentInput) total += e.value;
              }
            }).observe({ type: "layout-shift", buffered: true });
            setTimeout(() => resolve(total), 300);
          }),
      );
      expect(cls).toBeLessThanOrEqual(0.05);
    });
  }
});
