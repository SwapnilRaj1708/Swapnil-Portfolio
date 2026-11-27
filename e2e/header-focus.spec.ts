import { expect, type Page, test } from "./fixtures";
import { JOURNEY_ENABLED } from "../src/config/journey";
import { CHAPTERS } from "../src/lib/journey/chapters";
import { contactFlow } from "../src/content/data/contact-flow";
import { ui } from "../src/content/data/ui";

// PF-030: keyboard focus in the sticky header never scrolls the page, and every intentional jump
// (deep link, nav anchor, skip link, the contact flow's error focus) still lands fully below the
// header. Found in PF-009 follow-up 1: with `scroll-padding-top` on the scroll container, Chromium
// treated a focused header link as hidden behind that band and scrolled ~450 px up per link.
//
// Static tier: `?tier=static` (a normal build). A production build ignores the query and is static
// anyway (D-39), so the same tests run there unchanged – that is what ships.

const STATIC = "?tier=static";
const CASE_STUDY = "/work/twizzr";
const ROUTES = ["/", "/work", CASE_STUDY, "/resume"];
const SECTIONS = ["about", "experience", "work", "skills", "contact"];
/** Nav links that are anchors to a home section (Work opens /work, Resume its page). */
const NAV_ANCHORS: [string, string][] = [
  ["Experience", "experience"],
  ["About", "about"],
  ["Contact", "contact"],
  ["Skills", "skills"],
];
const SIZES = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const t = ui.transmission;

const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/** Loaded, hydrated (the phone menu answers Enter) and nothing left in flight. */
async function settle(page: Page) {
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle");
  await frames(page);
}

/**
 * The window sizes the landing tests cover: each of the four in the desktop project, and the phone
 * project at its own size (touch, 3×). One test per size.
 */
const SIZE_CASES: { label: string; size: { width: number; height: number } | null; project: string }[] = [
  ...SIZES.map((size) => ({ label: `${size.width}×${size.height}`, size, project: "desktop" })),
  { label: "390×844 (touch)", size: null, project: "phone" },
];

type Stop = { name: string; inHeader: boolean; y: number };

async function focusStop(page: Page): Promise<Stop> {
  await frames(page);
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    const header = document.querySelector("header");
    return {
      // The logo (the home link) is named "home" here; it reads as the owner's name.
      name: el?.getAttribute("href") === "/" ? "home" : (el?.getAttribute("aria-label") ?? el?.textContent ?? "").trim().replace(/\s+/g, " "),
      inHeader: !!el && !!header?.contains(el),
      y: window.scrollY,
    };
  });
}

/**
 * From mid-page: Tab from the top of the tab order (the skip link) through every header control to
 * the last one (the Simple-view switch; on the phone the menu is opened with Enter on the way),
 * then Shift+Tab back to the skip link. Returns every stop with the scroll position after it.
 */
async function tabThroughHeader(page: Page) {
  const forward: Stop[] = [];
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    const stop = await focusStop(page);
    forward.push(stop);
    if (stop.name === "Simple view") break;
    if (stop.name === "Menu") {
      const expanded = await page.evaluate(() => document.activeElement?.getAttribute("aria-expanded"));
      if (expanded === "false") {
        await page.keyboard.press("Enter");
        await expect(page.locator("header button[aria-expanded]")).toHaveAttribute("aria-expanded", "true");
        forward.push({ ...(await focusStop(page)), name: "Menu (opened)" });
      }
    }
  }
  const backward: Stop[] = [];
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Shift+Tab");
    const stop = await focusStop(page);
    backward.push(stop);
    if (stop.name === "Skip to content") break;
  }
  return { forward, backward };
}

test("the header offset sits on the scroll targets, not on the scroll container (PF-030)", async ({ page }) => {
  await page.goto(`/${STATIC}`);
  const offsets = await page.evaluate(() => {
    const margin = (el: Element | null) => (el ? getComputedStyle(el).scrollMarginTop : "missing");
    const header = document.querySelector("header")!;
    return {
      htmlPadding: getComputedStyle(document.documentElement).scrollPaddingTop,
      bodyPadding: getComputedStyle(document.body).scrollPaddingTop,
      headerHeight: getComputedStyle(document.documentElement).getPropertyValue("--spacing-header").trim(),
      main: margin(document.getElementById("main")),
      sections: ["about", "experience", "work", "skills", "contact"].map((id) => margin(document.getElementById(id))),
      headings: ["about-heading", "contact-heading"].map((id) => margin(document.getElementById(id))),
      field: margin(document.querySelector("#contact input, #contact textarea")),
      headerControls: [...header.querySelectorAll("a, button")].map(margin),
      header: margin(header),
      headerBox: `${header.getBoundingClientRect().height}px`,
    };
  });
  expect(offsets.htmlPadding).toBe("auto");
  expect(offsets.bodyPadding).toBe("auto");
  expect(offsets.headerHeight).toBe("4rem");
  // The header's whole height: its 4rem row (64 px at the default root size) and its 1 px border.
  expect(offsets.headerBox).toBe("65px");
  expect(offsets.main).toBe(offsets.headerBox);
  expect(offsets.sections).toEqual(Array(5).fill(offsets.headerBox));
  expect(offsets.headings).toEqual([offsets.headerBox, offsets.headerBox]);
  expect(offsets.field).toBe(offsets.headerBox);
  expect(offsets.header).toBe("0px");
  expect(offsets.headerControls.length).toBeGreaterThan(5);
  expect(new Set(offsets.headerControls)).toEqual(new Set(["0px"]));
});

test.describe("header focus never scrolls the page (PF-030)", () => {
  // The render-tier variant waits for the canvas and the spine (up to 45 s under a full run).
  test.describe.configure({ timeout: 90_000 });
  const variants: [string, string][] = ROUTES.map((route) => [route, `${route}${STATIC}`]);
  // The render tier too, where the build has the 3D layer: the spine and Lenis are running.
  if (JOURNEY_ENABLED) variants.push(["/ (render tier)", "/?tier=high"]);

  for (const [label, path] of variants) {
    test(`Tab and Shift+Tab through every header control from mid-page – ${label}`, async ({ page, isMobile }, info) => {
      await page.goto(path);
      if (path.includes("tier=high")) {
        await page.waitForFunction(() => window.__journey?.scroll?.()?.active === true, null, { timeout: 45_000 });
      }
      await settle(page);
      const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      const target = Math.min(3000, Math.floor(max / 2));
      expect(target, "the page is long enough to start mid-page").toBeGreaterThan(400);
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), target);
      await settle(page);
      const start = await page.evaluate(() => window.scrollY);
      expect(Math.abs(start - target)).toBeLessThanOrEqual(1);

      const { forward, backward } = await tabThroughHeader(page);
      const all = [...forward, ...backward];
      console.log(
        `[header focus] ${info.project.name} ${label}: start ${start}; Tab ${forward.map((s) => `${s.name}@${s.y}`).join(" → ")}; Shift+Tab ${backward.map((s) => `${s.name}@${s.y}`).join(" → ")}`,
      );

      // The page never moved.
      for (const s of all) expect(Math.abs(s.y - start), `scrollY after focusing ${s.name}`).toBeLessThanOrEqual(1);

      // Every header control was a stop: Tab reached each one (Shift+Tab starts from the last).
      const expected = isMobile
        ? ["Work", "Resume", "Menu", "About", "Experience", "Skills", "Contact", "Simple view"]
        : ["Work", "About", "Experience", "Skills", "Contact", "Resume", "Simple view"];
      expect(forward.map((s) => s.name)).toEqual(["Skip to content", "home", ...expected.flatMap((n) => (n === "Menu" ? [n, "Menu (opened)"] : [n]))]);
      expect(backward.map((s) => s.name)).toEqual([...expected.slice(0, -1).reverse(), "home", "Skip to content"]);
      // Every stop after the skip link is inside the header: Tab never left it.
      expect(all.filter((s) => s.name !== "Skip to content").every((s) => s.inHeader)).toBe(true);
    });
  }
});

/** The element's box against the header's bottom edge and the window. */
async function landing(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const header = document.querySelector("header")!.getBoundingClientRect();
    const box = document.querySelector(sel)!.getBoundingClientRect();
    return { headerBottom: header.bottom, top: box.top, bottom: box.bottom, viewport: window.innerHeight, y: window.scrollY };
  }, selector);
}

function expectBelowHeader(box: Awaited<ReturnType<typeof landing>>, what: string) {
  expect(box.top, `${what}: top ${box.top} below the header (${box.headerBottom})`).toBeGreaterThanOrEqual(box.headerBottom - 0.5);
  expect(box.bottom, `${what}: bottom ${box.bottom} inside the window (${box.viewport})`).toBeLessThanOrEqual(box.viewport + 0.5);
}

/** Waits until the scroll position has not changed for a few frames (a plain anchor jump is instant). */
async function scrollSettled(page: Page) {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const y = window.scrollY;
        let n = 0;
        const step = () => {
          if (window.scrollY !== y) return resolve(false);
          if (++n >= 6) return resolve(true);
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
}

test.describe("jumps land below the header (PF-030)", () => {
  test.describe.configure({ timeout: 90_000 });

  for (const c of SIZE_CASES) {
    test.describe(c.label, () => {
      test.skip(({ isMobile }) => (c.project === "phone") !== isMobile, `runs in the ${c.project} project`);
      test.beforeEach(async ({ page }) => {
        if (c.size) await page.setViewportSize(c.size);
      });

      test("deep links /#about … /#contact land with the heading fully below the header", async ({ page }, info) => {
        for (const id of SECTIONS) {
          await page.goto(`/${STATIC}#${id}`);
          await settle(page);
          await scrollSettled(page);
          const box = await landing(page, `#${id}-heading`);
          console.log(`[landing] ${info.project.name} ${c.label} deep link #${id}: y ${box.y}, heading ${box.top.toFixed(1)}–${box.bottom.toFixed(1)} (header ${box.headerBottom})`);
          expect(box.y, `#${id} scrolled`).toBeGreaterThan(0);
          expectBelowHeader(box, `${c.label} #${id}`);
        }
      });

      test("nav anchors land with the heading fully below the header", async ({ page }, info) => {
        // Static tier on a plain `/` (simple view remembered), as most visitors have it: no query on
        // the address. The same links on an address with a query (`?utm_source=…`, `?trk=…`, a
        // testing override) are covered below (PF-030 follow-up 1).
        await page.addInitScript(() => {
          try {
            window.localStorage.setItem("simple-view", "on");
          } catch {}
        });
        await page.goto("/");
        await settle(page);
        for (const [name, id] of NAV_ANCHORS) {
          const menu = page.locator("header button[aria-expanded]");
          if ((await menu.isVisible()) && (await menu.getAttribute("aria-expanded")) !== "true") await menu.click();
          const before = await page.evaluate(() => window.scrollY);
          await page.locator("header").getByRole("link", { name, exact: true }).click();
          await page.waitForFunction((hash) => location.hash === hash, `#${id}`);
          // The link's own navigation scrolls a moment after the hash changes.
          await page.waitForFunction((y) => window.scrollY !== y, before, { timeout: 10_000 });
          await scrollSettled(page);
          const box = await landing(page, `#${id}-heading`);
          console.log(`[landing] ${info.project.name} ${c.label} nav ${name}: y ${box.y}, heading ${box.top.toFixed(1)}–${box.bottom.toFixed(1)} (header ${box.headerBottom})`);
          expectBelowHeader(box, `${c.label} nav ${name}`);
        }
      });

      test("the skip link from mid-page lands main and its first heading below the header", async ({ page }, info) => {
        for (const route of ["/", "/work", "/resume"]) {
          await page.goto(`${route}${STATIC}`);
          await settle(page);
          await page.evaluate(() => window.scrollTo({ top: (document.documentElement.scrollHeight - window.innerHeight) / 2, behavior: "instant" }));
          await scrollSettled(page);
          await page.keyboard.press("Tab");
          await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
          await page.keyboard.press("Enter");
          await expect(page.locator("main#main")).toBeFocused();
          await scrollSettled(page);
          const main = await landing(page, "main#main");
          const heading = await landing(page, "main h1");
          console.log(`[landing] ${info.project.name} ${c.label} skip link ${route}: y ${main.y}, main top ${main.top.toFixed(1)}, h1 ${heading.top.toFixed(1)}–${heading.bottom.toFixed(1)} (header ${main.headerBottom})`);
          expect(main.top, "main starts at or below the header").toBeGreaterThanOrEqual(main.headerBottom - 0.5);
          expectBelowHeader(heading, `${c.label} ${route} h1`);
        }
      });

      test("the contact flow's error focus lands the field fully below the header", async ({ page }, info) => {
        const hello = contactFlow.intents.find((i) => i.id === "hello");
        expect(hello, "the hello intent exists").toBeTruthy();
        await page.goto(`/${STATIC}`);
        await expect(page.getByRole("button", { name: new RegExp(t.next) })).toBeEnabled();
        await settle(page);
        await page.locator("#contact label").filter({ has: page.getByRole("radio", { name: hello!.label, exact: true }) }).click();
        await expect(page.getByRole("heading", { name: t.contactQuestion })).toBeFocused();
        // Put the empty name field behind the sticky header, then press Next (no Playwright scrolling).
        // The flow sits near the end of the page, so a spacer after the footer gives room to scroll.
        const field = page.getByRole("textbox", { name: t.nameLabel });
        const selector = `#contact [name="${await field.getAttribute("name")}"]`;
        await field.evaluate((el) => {
          const spacer = document.createElement("div");
          spacer.style.height = "200vh";
          document.body.append(spacer);
          const top = el.getBoundingClientRect().top + window.scrollY;
          window.scrollTo({ top: top - 16, behavior: "instant" });
        });
        await scrollSettled(page);
        const hidden = await landing(page, selector);
        expect(hidden.top, "the field starts behind the header").toBeLessThan(hidden.headerBottom - 32);
        await page.getByRole("button", { name: new RegExp(t.next) }).evaluate((b) => (b as HTMLButtonElement).click());
        await expect(field).toBeFocused();
        await expect(page.locator("#contact").getByText(t.errorName)).toBeVisible();
        await scrollSettled(page);
        const box = await landing(page, selector);
        console.log(`[landing] ${info.project.name} ${c.label} contact error focus: field ${box.top.toFixed(1)}–${box.bottom.toFixed(1)} (header ${box.headerBottom}), was ${hidden.top.toFixed(1)}`);
        expectBelowHeader(box, `${c.label} name field`);
      });
    });
  }

  test("Shift+Tab up through main keeps each focused link below the header (focus not obscured)", async ({ page }, info) => {
    await page.goto(`/work${STATIC}`);
    await settle(page);
    // Start on the last link in main, at the bottom, and walk up until focus reaches the header.
    await page.evaluate(() => {
      const links = document.querySelectorAll<HTMLElement>("main a[href]");
      links[links.length - 1].focus();
    });
    const seen: number[] = [];
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Shift+Tab");
      await frames(page);
      const state = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const header = document.querySelector("header")!;
        const r = el.getBoundingClientRect();
        return { inHeader: header.contains(el), inMain: !!el.closest("main"), top: r.top, bottom: r.bottom, headerBottom: header.getBoundingClientRect().bottom, viewport: window.innerHeight };
      });
      if (!state.inMain) break;
      seen.push(state.top);
      expect(state.top, `stop ${i} below the header`).toBeGreaterThanOrEqual(state.headerBottom - 1);
      expect(state.bottom, `stop ${i} inside the window`).toBeLessThanOrEqual(state.viewport + 0.5);
    }
    console.log(`[focus not obscured] ${info.project.name} /work: ${seen.length} stops in main`);
    expect(seen.length).toBeGreaterThan(5);
  });
});

// ---------------------------------------------------------------------------------------------
// PF-030 follow-up 1: in-page anchors on an address with a query string. LinkedIn and campaign
// links carry one (`?trk=…`, `?utm_source=…`). On such an address a header link to `/#contact`
// changed the hash but never scrolled: Next's router saw a navigation to another URL (`/` without
// the query), reused the static home page segment, and so had no new segment to scroll – its hash
// scroll runs only for a hash-only change or on a new segment. The visitor's query was dropped too.
//
// Variants: the addresses as a visitor has them (the static tier here: the headless shell renders
// with SwiftShader, a static trigger; and on the production build), the static tier forced, and the
// render tier, where the query also holds the `?tier=` override (it must survive the jumps; PF-008
// follow-up 1). The production build ignores `?tier=`: there it is just another query, static.

type QueryVariant = { label: string; path: string; tier: "visitor" | "static" | "high" };
const QUERY_VARIANTS: QueryVariant[] = [
  { label: "?utm_source=x", path: "/?utm_source=x", tier: "visitor" },
  { label: "?trk=public_profile", path: "/?trk=public_profile", tier: "visitor" },
  { label: "?tier=static&utm_source=x", path: "/?tier=static&utm_source=x", tier: "static" },
];
if (JOURNEY_ENABLED) QUERY_VARIANTS.push({ label: "?tier=high&utm_source=x (render tier)", path: "/?tier=high&utm_source=x", tier: "high" });

const chapterOf = (sectionId: string) => CHAPTERS.find((c) => c.sectionId === sectionId)!.id;

/** React has hydrated the header: its links carry their props, so a click is a client action. */
async function headerHydrated(page: Page) {
  await page.waitForFunction(() => [...document.querySelectorAll("header a")].every((a) => Object.keys(a).some((k) => k.startsWith("__reactProps$"))));
}

/** Opens the page, waits for the tier decision (and the spine on the render tier), checks the tier. */
async function openQueryVariant(page: Page, v: QueryVariant, hash = "") {
  await page.goto(`${v.path}${hash}`);
  if (v.tier === "high") {
    await page.waitForFunction(() => window.__journey?.ready === true && window.__journey.scroll?.()?.active === true, null, { timeout: 45_000 });
  } else if (JOURNEY_ENABLED) {
    await page.waitForFunction(() => performance.getEntriesByName("journey:decided").length > 0);
  }
  await settle(page);
  await headerHydrated(page);
  const state = await page.evaluate(() => ({
    canvas: document.documentElement.hasAttribute("data-journey-canvas"),
    journey: window.__journey?.state?.() ?? null,
  }));
  if (v.tier === "high") expect(state.journey).toMatchObject({ tier: "high", forced: true, reason: "override" });
  if (v.tier === "static") {
    expect(state.canvas, "static: no canvas").toBe(false);
    if (JOURNEY_ENABLED) expect(state.journey?.tier).toBe("static");
  }
  return state.journey ? `${state.journey.tier}${state.journey.reason ? ` (${state.journey.reason})` : ""}` : "static (no 3D layer)";
}

/**
 * The page has landed on section `id`: its heading fully below the header and inside the window,
 * and the section is the one at the header's bottom edge (or the page is at its end, where the last
 * sections cannot reach the top). On the render tier the spine's chapter is that section's too.
 */
async function expectLandedOn(page: Page, id: string, what: string, render: boolean) {
  if (render) {
    await page.waitForFunction(
      (chapter) => {
        const last = window.__journey?.scroll?.()?.lastJump;
        return last?.chapter === chapter && last.outcome !== null;
      },
      chapterOf(id),
      { timeout: 15_000 },
    );
  }
  await scrollSettled(page);
  const box = await landing(page, `#${id}-heading`);
  expectBelowHeader(box, what);
  const at = await page.evaluate((sectionId) => {
    const header = document.querySelector("header")!.getBoundingClientRect();
    const section = document.getElementById(sectionId)!.getBoundingClientRect();
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return { sectionTop: section.top, headerBottom: header.bottom, atEnd: window.scrollY >= max - 1 };
  }, id);
  expect(at.atEnd || Math.abs(at.sectionTop - at.headerBottom) <= 1.5, `${what}: section #${id} at the header (${at.sectionTop} vs ${at.headerBottom}, end ${at.atEnd})`).toBe(true);
  if (render) {
    const s = await page.evaluate(() => ({ chapter: window.__journey!.scroll!().chapter, section: document.documentElement.getAttribute("data-journey-section") }));
    expect(s, `${what}: the spine's chapter`).toEqual({ chapter: chapterOf(id), section: id });
  }
  return box;
}

/** Below lg the anchors sit behind the menu: open it (Enter from the keyboard, or a click). */
async function openMenu(page: Page, keyboard: boolean) {
  const menu = page.locator("header button[aria-expanded]");
  if (!(await menu.isVisible()) || (await menu.getAttribute("aria-expanded")) === "true") return;
  if (keyboard) {
    await menu.focus();
    await page.keyboard.press("Enter");
  } else {
    await menu.click();
  }
  await expect(menu).toHaveAttribute("aria-expanded", "true");
}

/** Activates the header link `name` by a click or by Enter on the focused link. */
async function activateHeaderLink(page: Page, name: string, keyboard: boolean) {
  await openMenu(page, keyboard);
  const link = page.locator("header").getByRole("link", { name, exact: true });
  if (keyboard) {
    await link.focus();
    await page.keyboard.press("Enter");
  } else {
    await link.click();
  }
}

test.describe("in-page anchors on an address with a query string (PF-030 follow-up 1)", () => {
  // The render-tier variant waits for the canvas and the spine; the deep-link test loads per section.
  test.describe.configure({ timeout: 180_000 });

  for (const v of QUERY_VARIANTS) {
    for (const keyboard of [false, true]) {
      const how = keyboard ? "Enter" : "click";
      test(`header anchors (${how}) scroll to their section and keep the query – ${v.label}`, async ({ page }, info) => {
        const tier = await openQueryVariant(page, v);
        const search = new URL(page.url()).search;
        for (const [name, id] of NAV_ANCHORS) {
          const before = await page.evaluate(() => window.scrollY);
          await activateHeaderLink(page, name, keyboard);
          await page.waitForFunction((hash) => location.hash === hash, `#${id}`);
          await page.waitForFunction((y) => Math.abs(window.scrollY - y) > 1, before, { timeout: 10_000 });
          const box = await expectLandedOn(page, id, `${v.label} ${how} ${name}`, v.tier === "high");
          const address = new URL(page.url());
          console.log(
            `[query anchor] ${info.project.name} ${v.label} [${tier}] ${how} ${name}: ${address.pathname}${address.search}${address.hash}, y ${before} → ${box.y}, heading ${box.top.toFixed(1)}–${box.bottom.toFixed(1)} (header ${box.headerBottom})`,
          );
          expect(address.pathname).toBe("/");
          expect(address.search, "the visitor's query is kept").toBe(search);
        }
        if (v.tier === "high") expect(await page.evaluate(() => window.__journey!.state())).toMatchObject({ tier: "high", forced: true, reason: "override" });
      });
    }

    test(`deep links with a query and a hash land on their section on a cold load – ${v.label}`, async ({ page }, info) => {
      // Every section on the static addresses; on the render tier (a canvas start per load) the
      // first and the last.
      const ids = v.tier === "high" ? ["about", "contact"] : SECTIONS;
      for (const id of ids) {
        const tier = await openQueryVariant(page, v, `#${id}`);
        if (v.tier === "high") {
          await page.waitForFunction((sectionId) => document.documentElement.getAttribute("data-journey-section") === sectionId, id, { timeout: 15_000 });
          await scrollSettled(page);
          expect(await page.evaluate(() => window.__journey!.scroll!().chapter)).toBe(chapterOf(id));
        }
        const box = await landing(page, `#${id}-heading`);
        console.log(`[query deep link] ${info.project.name} ${v.path}#${id} [${tier}]: y ${box.y}, heading ${box.top.toFixed(1)}–${box.bottom.toFixed(1)} (header ${box.headerBottom})`);
        expect(box.y, `#${id} scrolled`).toBeGreaterThan(0);
        expectBelowHeader(box, `${v.path}#${id}`);
        expect(new URL(page.url()).search).toBe(new URL(v.path, "http://localhost").search);
      }
    });
  }

  test("header anchors from another page land on the home section, with and without a query there", async ({ page }, info) => {
    const links: [string, string, boolean][] = [
      ["About", "about", false],
      ["Contact", "contact", true],
    ];
    for (const source of ["/work", "/work?utm_source=x", `${CASE_STUDY}?trk=public_profile`, "/resume?utm_source=x"]) {
      for (const [name, id, keyboard] of links) {
        await page.goto(source);
        await settle(page);
        await headerHydrated(page);
        await activateHeaderLink(page, name, keyboard);
        await page.waitForURL((url) => url.pathname === "/" && url.hash === `#${id}`);
        await page.waitForFunction(() => window.scrollY > 0, null, { timeout: 10_000 });
        const box = await expectLandedOn(page, id, `${source} → ${name}`, false);
        console.log(`[query anchor] ${info.project.name} from ${source} ${keyboard ? "Enter" : "click"} ${name}: ${page.url()}, y ${box.y}, heading ${box.top.toFixed(1)} (header ${box.headerBottom})`);
      }
    }
  });
});
