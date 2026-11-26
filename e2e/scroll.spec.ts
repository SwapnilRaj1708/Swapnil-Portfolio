import { expect, type Page, test } from "./fixtures";
import { buildStandinPath } from "../scripts/lib/standin-path.mjs";
import { JOURNEY_ENABLED } from "../src/config/journey";
import { CHAPTERS } from "../src/lib/journey/chapters";
import { expectNoAxeViolations } from "./axe";

// PF-008: the scroll spine, the chapter registry, the camera rig, navigation state, deep links and
// return. Everything here runs only where the 3D layer is built in (not the production deployment,
// D-39) and in a non-static tier. CI and Playwright's headless shell render with SwiftShader, which
// is a static trigger (D-41), so every run forces a tier with `?tier=high` (allowed off production).
// Nothing here depends on rendered pixels.
//
// The desktop project has a fine pointer: Lenis smooths the wheel ("lenis" mode). The phone
// project is touch-first: native scrolling, the camera eased ("native" mode). `?smooth=off` gives
// the native mode on desktop too.

type ScrollState = NonNullable<ReturnType<NonNullable<NonNullable<Window["__journey"]>["scroll"]>>>;
type RigState = NonNullable<ReturnType<NonNullable<NonNullable<Window["__journey"]>["rig"]>>>;

const HIGH = "/?tier=high";
const NATIVE = "/?tier=high&smooth=off";
/** The nav links that jump to a chapter section (the hero has none; Work opens /work). */
const NAV_FOR: Record<string, string> = { about: "About", experience: "Experience", skills: "Skills", contact: "Contact" };
/**
 * The links marked `aria-current="location"` per section, as `marked()` lists them (every header
 * link in the DOM, shown or not). The projects chapter (`work`) marks "Work" (href /work), which
 * is in the header twice: the quick link below lg and the list entry from lg – both carry the mark,
 * as both carry `aria-current="page"` on /work. The hero marks nothing.
 */
const MARKED_FOR: Record<string, string[]> = { ...Object.fromEntries(Object.entries(NAV_FOR).map(([id, name]) => [id, [name]])), work: ["Work", "Work"] };
const markedFor = (sectionId: string) => MARKED_FOR[sectionId] ?? [];

const scroll = (page: Page) => page.evaluate(() => window.__journey!.scroll!()) as Promise<ScrollState>;
const rig = (page: Page) => page.evaluate(() => window.__journey!.rig!()) as Promise<RigState>;

/** The canvas is drawn and the spine runs on this page. */
async function waitForSpine(page: Page) {
  await page.waitForFunction(() => window.__journey?.ready === true && window.__journey.scroll?.()?.active === true && !!window.__journey.rig, null, {
    timeout: 45_000,
  });
}

/** The store has caught up with the browser's scroll position (exact formula of scroll-math.ts). */
async function waitForStore(page: Page) {
  await page.waitForFunction(() => {
    const s = window.__journey?.scroll?.();
    if (!s) return false;
    const y = window.scrollY;
    const expected = s.max > 0 ? (y >= s.max - 0.5 ? 1 : y / s.max) : 0;
    return Math.abs(s.progress - expected) < 1e-9;
  });
}

/** Jumps the page (instantly, as a scrollbar drag or a find-in-page would) and waits for the store. */
async function scrollToY(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
  await waitForStore(page);
}

/** The camera has arrived where the scroll position puts it (the eased mode needs a moment). */
async function waitForCamera(page: Page) {
  await page.waitForFunction(() => {
    const r = window.__journey?.rig?.();
    return !!r && Math.abs(r.frame - r.targetFrame) < 0.01;
  }, null, { timeout: 15_000 });
}

function marked(page: Page) {
  return page.locator('header a[aria-current="location"]').evaluateAll((links) => links.map((a) => a.textContent));
}

/**
 * Holds back the tier loader's lazy chunk (recognised by content: the loader's `journey:checks`
 * mark) from `hold()` until `release()`. Routing turns the HTTP cache off, so every page load
 * requests it again. Each chunk's content is looked at once; after that the loader's file is held
 * and every other file passes straight through. `stop()` removes the route.
 */
async function holdTierLoader(page: Page) {
  let release = () => {};
  let held: Promise<void> = Promise.resolve();
  const isLoader = new Map<string, boolean>();
  const pattern = /\/_next\/static\/chunks\/.+\.js(\?.*)?$/;
  await page.route(pattern, async (route) => {
    const url = route.request().url();
    const known = isLoader.get(url);
    if (known !== undefined) {
      if (known) await held;
      await route.continue().catch(() => undefined);
      return;
    }
    let response: Awaited<ReturnType<typeof route.fetch>>;
    let body: Buffer;
    try {
      // Retries a connection reset (the local server under a full parallel run), as journey.spec.ts.
      response = await route.fetch({ maxRetries: 3 });
      body = await response.body();
    } catch {
      // The request went away (a navigation, the page closing): let the browser have it as it is.
      await route.continue().catch(() => undefined);
      return;
    }
    const loader = body.includes("journey:checks");
    isLoader.set(url, loader);
    if (loader) await held;
    await route.fulfill({ response, body }).catch(() => undefined);
  });
  return {
    hold: () => {
      held = new Promise<void>((resolve) => (release = resolve));
    },
    release: () => release(),
    stop: () => page.unroute(pattern),
  };
}

async function openMenuIfPhone(page: Page, phone: boolean) {
  if (!phone) return;
  const menu = page.getByRole("button", { name: "Menu" });
  if ((await menu.getAttribute("aria-expanded")) !== "true") await menu.click();
}

test.describe("scroll spine and camera rig (PF-008)", () => {
  test.skip(!JOURNEY_ENABLED, "this build is the production deployment: no 3D layer, no spine (D-39)");
  test.describe.configure({ timeout: 120_000 });

  test("progress is exactly 0 at the top and 1 at the bottom at every size, after a resize and an orientation flip", async ({ page }, info) => {
    const phone = info.project.name === "phone";
    const sizes = phone
      ? [{ width: 390, height: 844 }]
      : [
          { width: 360, height: 780 },
          { width: 390, height: 844 },
          { width: 1440, height: 900 },
          { width: 1920, height: 1080 },
        ];
    const check = async (label: string) => {
      await scrollToY(page, 0);
      const top = await scroll(page);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      await waitForStore(page);
      const bottom = await scroll(page);
      console.log(`[scroll ends] ${info.project.name} ${label}: top ${top.progress} (${top.chapter}), bottom ${bottom.progress} (${bottom.chapter}) at ${bottom.scrollY} / max ${bottom.max}`);
      expect(top.progress).toBe(0);
      expect(top.chapter).toBe("port");
      expect(bottom.progress).toBe(1);
      expect(bottom.chapter).toBe("uplink");
      expect(bottom.chapterProgress).toBe(1);
      expect(Math.abs(bottom.scrollY - bottom.max)).toBeLessThanOrEqual(1);
    };
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.goto(HIGH);
      await waitForSpine(page);
      await check(`${size.width}×${size.height}`);
    }
    // A resize (desktop) or a rotation to landscape and back (phone), on the same page.
    const flips = phone
      ? [
          { width: 844, height: 390 },
          { width: 390, height: 844 },
        ]
      : [
          { width: 1024, height: 700 },
          { width: 1440, height: 900 },
        ];
    for (const size of flips) {
      await page.setViewportSize(size);
      await page.waitForTimeout(400);
      await check(`after resize to ${size.width}×${size.height}`);
    }
  });

  test("chapter boundaries equal the sections – also after a resize and with extra scroll lengths", async ({ page }, info) => {
    const verify = async (label: string) => {
      await scrollToY(page, 0);
      const measured = await page.evaluate(() => {
        const padding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        const ids = ["top", "about", "experience", "work", "skills", "contact"];
        return ids.map((id, i) => (i === 0 ? 0 : document.getElementById(id)!.getBoundingClientRect().top + window.scrollY - padding));
      });
      const s = await scroll(page);
      console.log(`[chapter boundaries] ${info.project.name} ${label}: ${s.boundaries.map((b) => b.toFixed(1)).join(", ")} (max ${s.max})`);
      expect(s.boundaries).toHaveLength(CHAPTERS.length);
      s.boundaries.forEach((b, i) => expect(Math.abs(b - Math.min(measured[i], s.max))).toBeLessThan(0.5));
      // Each chapter starts exactly there: just before is the previous chapter, at it this one.
      for (let i = 1; i < CHAPTERS.length; i++) {
        await scrollToY(page, Math.round(s.boundaries[i]) - 3);
        expect((await scroll(page)).chapter).toBe(CHAPTERS[i - 1].id);
        await scrollToY(page, Math.ceil(s.boundaries[i]));
        const at = await scroll(page);
        expect(at.chapter).toBe(CHAPTERS[i].id);
        expect(at.chapterProgress).toBeLessThan(0.01);
      }
    };
    await page.goto(HIGH);
    await waitForSpine(page);
    await verify("as loaded");
    const vp = page.viewportSize()!;
    await page.setViewportSize({ width: Math.round(vp.width * 0.8), height: vp.height });
    await page.waitForTimeout(500);
    await verify("after a resize");
    await page.setViewportSize(vp);
    await page.waitForTimeout(300);
    // Extra scroll length: one viewport height at the end of the bus chapter, half at the array.
    const before = await scroll(page);
    await page.evaluate(() => {
      window.__journey!.setExtraScroll!("bus", 1);
      window.__journey!.setExtraScroll!("array", 0.5);
    });
    await page.waitForFunction((max) => (window.__journey?.scroll?.()?.max ?? 0) > max + 100, before.max);
    const after = await scroll(page);
    const height = await page.evaluate(() => window.innerHeight);
    expect(after.max - before.max).toBeGreaterThan(height * 1.5 - 2);
    expect(after.boundaries[2] - before.boundaries[2]).toBeCloseTo(height, -1);
    await verify("with extra scroll lengths");
  });

  test("keyboard scrolling works with Lenis on: PageDown, Space, arrows, End, Home move the page and progress follows", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "Lenis runs on fine-pointer devices (desktop)");
    await page.goto(HIGH);
    await waitForSpine(page);
    expect((await scroll(page)).mode).toBe("lenis");
    expect(await page.evaluate(() => document.documentElement.classList.contains("lenis"))).toBe(true);
    // Focus on the page itself (nothing focused): the keys scroll the document.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    let last = 0;
    for (const key of ["PageDown", "Space", "ArrowDown", "PageDown"]) {
      await page.keyboard.press(key);
      await page.waitForFunction((y) => window.scrollY > y, last);
      await page.waitForTimeout(400);
      await waitForStore(page);
      const s = await scroll(page);
      expect(s.scrollY).toBeGreaterThan(last);
      expect(s.progress).toBeCloseTo(s.scrollY / s.max, 9);
      last = s.scrollY;
    }
    await page.keyboard.press("End");
    await page.waitForFunction(() => window.__journey?.scroll?.()?.progress === 1, null, { timeout: 10_000 });
    expect((await scroll(page)).chapter).toBe("uplink");
    await page.keyboard.press("Home");
    await page.waitForFunction(() => window.scrollY === 0 && window.__journey?.scroll?.()?.progress === 0, null, { timeout: 10_000 });
    expect((await scroll(page)).chapter).toBe("port");
  });

  test("a wheel moves the page by the same distance with Lenis as natively", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "wheel input: desktop");
    const travel = async (path: string) => {
      await page.goto(path);
      await waitForSpine(page);
      await page.mouse.move(700, 500);
      for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 120);
      await page.waitForTimeout(2500); // Lenis settles
      return page.evaluate(() => window.scrollY);
    };
    const smooth = await travel(HIGH);
    const native = await travel(NATIVE);
    console.log(`[wheel distance] 4 × 120 px: Lenis ${smooth} px, native ${native} px`);
    expect(Math.abs(smooth - native)).toBeLessThanOrEqual(1);
  });

  test.describe("listeners never block scrolling: the preventDefault audit", () => {
    const TYPES = ["wheel", "mousewheel", "touchstart", "touchmove", "touchend", "keydown", "keypress", "scroll"];

    /** Wraps addEventListener and preventDefault before any page script runs. */
    function installAudit(page: Page) {
      return page.addInitScript((types: string[]) => {
        const TYPES = new Set(types);
        type Reg = { type: string; target: string; passive: boolean | undefined; capture: boolean; source: string };
        const regs: Reg[] = [];
        const prevented: { type: string; cancelable: boolean; registration: number }[] = [];
        let current = -1;
        const wrappers = new WeakMap<object, Map<string, EventListener>>();
        const describe = (t: EventTarget) =>
          t === window ? "window" : t === document ? "document" : t instanceof Element ? t.tagName.toLowerCase() + (t.id ? `#${t.id}` : "") : String(t);
        const add = EventTarget.prototype.addEventListener;
        const remove = EventTarget.prototype.removeEventListener;
        EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
          if (!TYPES.has(type) || !listener) return add.call(this, type, listener, options);
          const capture = typeof options === "boolean" ? options : !!options?.capture;
          const passive = typeof options === "object" && options !== null && "passive" in options ? options.passive : undefined;
          const fn = typeof listener === "function" ? listener : listener.handleEvent;
          const source = (fn ? Function.prototype.toString.call(fn) : "").replace(/\s+/g, " ").slice(0, 200);
          const index = regs.push({ type, target: describe(this), passive, capture, source }) - 1;
          const key = `${type}|${capture}`;
          let map = wrappers.get(listener);
          if (!map) wrappers.set(listener, (map = new Map()));
          let wrapper = map.get(key);
          if (!wrapper) {
            wrapper = function (this: unknown, event: Event) {
              const previous = current;
              current = index;
              try {
                return typeof listener === "function" ? listener.call(this, event) : listener.handleEvent(event);
              } finally {
                current = previous;
              }
            };
            map.set(key, wrapper);
          }
          return add.call(this, type, wrapper, options);
        };
        EventTarget.prototype.removeEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
          const capture = typeof options === "boolean" ? options : !!options?.capture;
          const wrapper = listener ? wrappers.get(listener)?.get(`${type}|${capture}`) : undefined;
          return remove.call(this, type, wrapper ?? listener, options);
        };
        const preventDefault = Event.prototype.preventDefault;
        Event.prototype.preventDefault = function (this: Event) {
          if (TYPES.has(this.type)) prevented.push({ type: this.type, cancelable: this.cancelable, registration: current });
          return preventDefault.call(this);
        };
        (window as Window & { __audit?: unknown }).__audit = { regs, prevented };
      }, TYPES);
    }

    type Audit = {
      regs: { type: string; target: string; passive: boolean | undefined; capture: boolean; source: string }[];
      prevented: { type: string; cancelable: boolean; registration: number }[];
    };
    const audit = (page: Page) => page.evaluate(() => (window as Window & { __audit?: unknown }).__audit) as Promise<Audit>;

    /** Lenis's own listeners, recognised by their code (property names survive minification). */
    const isLenis = (source: string) => /wheelMultiplier|touchMultiplier|targetTouches|lastDelta|_resetVelocityTimeout|_preventNextNativeScrollEvent|lenisScrollEnd/.test(source);

    async function scrollEveryWay(page: Page, phone: boolean) {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      if (phone) {
        const cdp = await page.context().newCDPSession(page);
        for (const yDistance of [-700, -700, 500]) {
          await cdp.send("Input.synthesizeScrollGesture", { x: 200, y: 500, yDistance, gestureSourceType: "touch", speed: 1500 });
        }
        await cdp.detach();
      } else {
        await page.mouse.move(700, 500);
        for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 240);
        await page.waitForTimeout(800);
        await page.mouse.wheel(0, -300);
        await page.waitForTimeout(800);
      }
      for (const key of ["PageDown", "Space", "ArrowDown", "ArrowUp", "End", "Home"]) {
        await page.keyboard.press(key);
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(800);
    }

    test("with ?smooth=off: no listener cancels a wheel, touch, key or scroll event", async ({ page }, info) => {
      const phone = info.project.name === "phone";
      await installAudit(page);
      await page.goto(NATIVE);
      await waitForSpine(page);
      expect((await scroll(page)).mode).toBe("native");
      await scrollEveryWay(page, phone);
      const a = await audit(page);
      console.log(`[listener audit] ${info.project.name} smooth=off: ${a.regs.length} listeners of these types; ${a.prevented.length} preventDefault calls`);
      expect(a.regs.filter((r) => isLenis(r.source))).toEqual([]);
      expect(a.prevented).toEqual([]);
      await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 10_000 }); // Home brought it back: the keys worked
    });

    test("with Lenis on: only Lenis's wheel handler cancels events (it moves the page itself); touch and keys stay native", async ({ page }, info) => {
      const phone = info.project.name === "phone";
      await installAudit(page);
      await page.goto(HIGH);
      await waitForSpine(page);
      const mode = (await scroll(page)).mode;
      expect(mode).toBe(phone ? "native" : "lenis");
      await scrollEveryWay(page, phone);
      const a = await audit(page);
      const lenis = a.regs.filter((r) => isLenis(r.source));
      console.log(
        `[listener audit] ${info.project.name} ${mode}: ${a.regs.length} listeners; Lenis registered:\n` +
          (lenis.map((r) => `  ${r.target} ${r.type} passive=${r.passive} capture=${r.capture}: ${r.source.slice(0, 90)}…`).join("\n") || "  (none)") +
          `\n  preventDefault calls: ${a.prevented.map((p) => `${p.type} by ${a.regs[p.registration]?.target ?? "?"} ${a.regs[p.registration]?.type ?? "?"}${isLenis(a.regs[p.registration]?.source ?? "") ? " (Lenis)" : ""}`).join(", ") || "none"}`,
      );
      for (const p of a.prevented) {
        const reg = a.regs[p.registration];
        expect(reg, `a ${p.type} preventDefault outside any audited listener`).toBeDefined();
        expect(p.type).toBe("wheel");
        expect(reg.type).toBe("wheel");
        expect(reg.source).toMatch(/wheelMultiplier/);
      }
      if (!phone) {
        expect(a.prevented.length).toBeGreaterThan(0); // Lenis really smoothed the wheel
        expect(lenis.map((r) => `${r.target}:${r.type}`)).toEqual(expect.arrayContaining(["window:wheel", "window:touchstart", "window:touchmove"]));
      } else {
        expect(lenis).toEqual([]); // no Lenis on touch-first devices
      }
      await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 10_000 });
    });
  });

  test("the scene does not re-render through React while the page scrolls", async ({ page }) => {
    await page.goto(HIGH);
    await waitForSpine(page);
    await page.waitForTimeout(1000);
    const before = await page.evaluate(() => ({ ...window.__journey!.renders }));
    const max = (await scroll(page)).max;
    for (let y = 0; y <= max; y += 250) await scrollToY(page, y);
    await scrollToY(page, max);
    for (let y = max; y >= 0; y -= 400) await scrollToY(page, y);
    await scrollToY(page, 0);
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({ ...window.__journey!.renders }));
    console.log(`[journey renders] ${JSON.stringify(after)}`);
    expect(Object.keys(before).length).toBeGreaterThanOrEqual(6);
    expect(after).toEqual(before);
  });

  test("deep links land on their chapter on a cold load", async ({ page }) => {
    for (const [i, c] of CHAPTERS.entries()) {
      await page.goto(`${HIGH}#${c.sectionId}`);
      await waitForSpine(page);
      await waitForStore(page);
      const s = await scroll(page);
      expect(s.chapter, `#${c.sectionId}`).toBe(c.id);
      if (i > 0 && s.boundaries[i] < s.max) {
        expect(Math.abs(s.scrollY - s.boundaries[i])).toBeLessThanOrEqual(1);
        expect(s.chapterProgress).toBeLessThan(0.01);
      }
      // The camera starts at the chapter's pose (no fly-through from the port).
      await waitForCamera(page);
      const r = await rig(page);
      if (s.chapterProgress < 0.01) expect(Math.abs(r.frame - r.starts[i])).toBeLessThan(0.5);
      expect(await marked(page)).toEqual(markedFor(c.sectionId));
    }
  });

  // Regression test for the PF-008 CI failure: the client link from /work?tier=high to /#<id> drops
  // the query, and on a slow runner the lazy tier loader ran after that navigation, saw no
  // override, found SwiftShader and went static – so the spine never started. The loader's chunk
  // is held back here until the navigation is done, which makes that order certain on any
  // machine. The overrides must come from the address the visit was loaded with and stay for the
  // session (src/lib/journey/overrides.ts).
  test("deep links land on their chapter after a client navigation", async ({ page }, info) => {
    // Six page loads and a reload, each starting the 3D chunk on a software renderer, with the HTTP
    // cache off while the route holds the loader: more than the suite's 120 s under a full parallel
    // run (the first local run timed out in the final reload). The waits inside are unchanged.
    test.setTimeout(240_000);
    const phone = info.project.name === "phone";
    const loader = await holdTierLoader(page);
    // The held chunk keeps the load event from firing, so wait for the DOM and then for React to
    // have hydrated the header (its props attached to the links): a click is then a client
    // navigation, as on CI, never a full page load.
    const openWorkHydrated = async (p: Page) => {
      await p.goto("/work?tier=high", { waitUntil: "domcontentloaded" });
      await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
      await p.waitForFunction(() =>
        [...document.querySelectorAll("header a")].every((a) => Object.keys(a).some((k) => k.startsWith("__reactProps$"))),
      );
    };
    const expectForcedHigh = async () =>
      expect(await page.evaluate(() => window.__journey!.state())).toMatchObject({ tier: "high", forced: true, reason: "override" });
    for (const id of ["about", "experience", "skills", "contact"]) {
      loader.hold();
      await openWorkHydrated(page);
      await openMenuIfPhone(page, phone);
      await page.locator("header").getByRole("link", { name: NAV_FOR[id], exact: true }).click();
      await page.waitForURL(`**/#${id}`, { waitUntil: "commit" });
      // The loader has not decided anything yet: it will see an address without the query.
      expect(await page.evaluate(() => performance.getEntriesByName("journey:checks").length)).toBe(0);
      loader.release();
      await waitForSpine(page);
      await waitForStore(page);
      await expectForcedHigh();
      const s = await scroll(page);
      const index = CHAPTERS.findIndex((c) => c.sectionId === id);
      expect(s.chapter).toBe(CHAPTERS[index].id);
      expect(Math.abs(s.scrollY - Math.min(s.boundaries[index], s.max))).toBeLessThanOrEqual(1);
      expect(await marked(page)).toEqual([NAV_FOR[id]]);
    }
    // The home link: back to the top, the port.
    loader.hold();
    await openWorkHydrated(page);
    await page.locator("header a[href='/']").click();
    await page.waitForURL((url) => url.pathname === "/", { waitUntil: "commit" });
    loader.release();
    await waitForSpine(page);
    await expectForcedHigh();
    expect((await scroll(page)).chapter).toBe("port");
    // Kept for the session: a reload of an address without the query still runs the spine (the
    // route is gone: nothing is held, the cache is back).
    await loader.stop();
    await page.goto("/#skills");
    await page.reload();
    expect(await page.evaluate(() => new URL(performance.getEntriesByType("navigation")[0].name).search)).toBe("");
    await waitForSpine(page);
    await expectForcedHigh();
    await waitForStore(page);
    expect((await scroll(page)).chapter).toBe(CHAPTERS.find((c) => c.sectionId === "skills")!.id);
  });

  for (const [label, path] of [
    ["Lenis on (desktop) / native (phone)", HIGH],
    ["?smooth=off", NATIVE],
  ] as const) {
    test(`Back from a case study restores the position, chapter and camera; a reload keeps it – ${label}`, async ({ page }) => {
      await page.goto(path);
      await waitForSpine(page);
      const start = await scroll(page);
      const target = Math.round(start.boundaries[3] + (start.boundaries[4] - start.boundaries[3]) * 0.3);
      await scrollToY(page, target);
      await waitForCamera(page);
      const there = await scroll(page);
      const pose = await rig(page);
      expect(there.chapter).toBe("array");

      // A project card to its case study (clicked in place, so the page does not move first), then Back.
      const card = page.locator("#work article a[href^='/work/']").first();
      await card.evaluate((a: HTMLAnchorElement) => a.click());
      await page.waitForURL(/\/work\/[^/]+$/);
      // The case study rendered: the spine stopped, the page scrolls natively. (Next.js keeps the home
      // page's DOM mounted but hidden for an instant Back – the sections exist, not shown.)
      await page.waitForFunction(() => (document.getElementById("about")?.getClientRects().length ?? 0) === 0 && window.__journey?.scroll === null);
      expect(await page.evaluate(() => document.documentElement.classList.contains("lenis") || document.documentElement.hasAttribute("data-journey-section"))).toBe(false);

      await page.goBack();
      await page.waitForURL((url) => url.pathname === "/");
      await waitForSpine(page);
      await page.waitForFunction((y) => Math.abs(window.scrollY - y) <= 2, target, { timeout: 15_000 });
      await waitForStore(page);
      await waitForCamera(page);
      const back = await scroll(page);
      const backPose = await rig(page);
      console.log(`[return] ${label}: scrolled to ${target}, after Back ${back.scrollY} (${back.chapter}, epoch ${there.epoch} → ${back.epoch})`);
      expect(back.chapter).toBe("array");
      expect(Math.abs(back.progress - there.progress)).toBeLessThan(0.001);
      // The camera is where it was – it snapped there (a new epoch), no fly-through.
      expect(back.epoch).toBeGreaterThan(there.epoch);
      expect(Math.abs(backPose.frame - pose.frame)).toBeLessThan(0.5);
      backPose.position.forEach((v, i) => expect(v).toBeCloseTo(pose.position[i], 1));

      // A reload keeps the position.
      await page.reload();
      await waitForSpine(page);
      await page.waitForFunction((y) => Math.abs(window.scrollY - y) <= 2, target, { timeout: 15_000 });
      await waitForStore(page);
      expect((await scroll(page)).chapter).toBe("array");
    });
  }

  test("the navigation marks the current chapter (aria-current=location) and follows it", async ({ page }, info) => {
    await page.goto(HIGH);
    await waitForSpine(page);
    const s = await scroll(page);
    for (const [i, c] of CHAPTERS.entries()) {
      const end = i + 1 < CHAPTERS.length ? s.boundaries[i + 1] : s.max;
      await scrollToY(page, Math.round((s.boundaries[i] + end) / 2));
      expect((await scroll(page)).chapter).toBe(c.id);
      await expect.poll(() => marked(page)).toEqual(markedFor(c.sectionId));
      if (c.sectionId === "work") {
        // The projects chapter: the Work link shown in the header (the list entry on desktop, the
        // quick link on the phone) is marked and underlined like the others; it still opens /work.
        const work = page.locator('header a[aria-current="location"]').filter({ visible: true });
        await expect(work).toHaveCount(1);
        await expect(work).toHaveText("Work");
        await expect(work).toHaveAttribute("href", "/work");
        expect(await work.evaluate((a) => getComputedStyle(a).textDecorationLine)).toContain("underline");
      }
    }
    if (info.project.name === "desktop") {
      // Not colour alone: the current link is underlined.
      const link = page.locator('header a[aria-current="location"]');
      await expect(link).toHaveCount(1);
      expect(await link.evaluate((a) => getComputedStyle(a).textDecorationLine)).toContain("underline");
    }
  });

  for (const [label, path] of [
    ["Lenis on (desktop) / native (phone)", HIGH],
    ["?smooth=off", NATIVE],
  ] as const) {
    test(`a nav jump scrolls there, lands with the heading below the header and moves focus – ${label}`, async ({ page }, info) => {
      const phone = info.project.name === "phone";
      await page.goto(path);
      await waitForSpine(page);
      await page.evaluate(() => {
        const w = window as Window & { __positions?: number[] };
        w.__positions = [];
        window.addEventListener("scroll", () => w.__positions!.push(window.scrollY), { passive: true });
      });
      for (const [id, via] of [
        ["experience", "click"],
        ["about", "click"],
        ["contact", "keyboard"],
      ] as const) {
        await openMenuIfPhone(page, phone);
        const link = page.locator("header").getByRole("link", { name: NAV_FOR[id], exact: true });
        await page.evaluate(() => ((window as Window & { __positions?: number[] }).__positions!.length = 0));
        if (via === "keyboard") {
          await link.focus();
          await page.keyboard.press("Enter");
        } else {
          await link.click();
        }
        const index = CHAPTERS.findIndex((c) => c.sectionId === id);
        await page.waitForFunction((sectionId) => document.activeElement?.id === sectionId, id, { timeout: 15_000 });
        const s = await scroll(page);
        const positions = await page.evaluate(() => (window as Window & { __positions?: number[] }).__positions!.slice());
        const landed = await page.evaluate((sectionId) => {
          const header = document.querySelector("header")!.getBoundingClientRect();
          const heading = document.getElementById(`${sectionId}-heading`)!.getBoundingClientRect();
          return { headerBottom: header.bottom, headingTop: heading.top, headingBottom: heading.bottom, viewport: window.innerHeight, hash: location.hash };
        }, id);
        console.log(`[nav jump] ${info.project.name} ${label} ${via} → #${id}: landed ${s.scrollY} (start ${s.boundaries[index].toFixed(1)}), ${positions.length} scroll steps, heading ${landed.headingTop.toFixed(0)}–${landed.headingBottom.toFixed(0)} px`);
        expect(s.chapter).toBe(CHAPTERS[index].id);
        expect(Math.abs(s.scrollY - Math.min(s.boundaries[index], s.max))).toBeLessThanOrEqual(1);
        expect(landed.hash).toBe(`#${id}`);
        expect(landed.headingTop).toBeGreaterThanOrEqual(landed.headerBottom - 1);
        expect(landed.headingBottom).toBeLessThanOrEqual(landed.viewport);
        // Smooth: the page travelled through intermediate positions, not one jump.
        expect(positions.length).toBeGreaterThan(2);
      }
    });
  }

  test("under reduced motion (turned on mid-visit) the static tier takes over: no chapter mark, and a jump is instant", async ({ page }, info) => {
    const phone = info.project.name === "phone";
    await page.goto(HIGH);
    await waitForSpine(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(() => window.__journey?.state().tier === "static");
    expect((await page.evaluate(() => window.__journey!.state())).reason).toBe("reduced-motion");
    await expect(page.locator("canvas")).toHaveCount(0);
    expect(await page.evaluate(() => window.__journey!.scroll)).toBeNull();
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-journey-section") || document.documentElement.classList.contains("lenis"))).toBe(false);
    // The address as a visitor has it (the `?tier=` test override dropped): the nav link is then a
    // same-page anchor, which the browser and Next.js scroll to – instantly under reduced motion.
    await page.evaluate(() => {
      window.history.replaceState(null, "", "/");
      const w = window as Window & { __positions?: number[] };
      w.__positions = [];
      window.addEventListener("scroll", () => w.__positions!.push(window.scrollY), { passive: true });
    });
    await openMenuIfPhone(page, phone);
    await page.locator("header").getByRole("link", { name: "Skills", exact: true }).click();
    await page.waitForFunction(() => location.hash === "#skills");
    await page.waitForFunction(() => ((window as Window & { __positions?: number[] }).__positions ?? []).length > 0, null, { timeout: 10_000 });
    await page.waitForTimeout(600);
    const result = await page.evaluate(() => {
      const padding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const target = document.getElementById("skills")!.getBoundingClientRect().top + window.scrollY - padding;
      return { positions: (window as Window & { __positions?: number[] }).__positions!, scrollY: window.scrollY, target };
    });
    console.log(`[reduced motion jump] ${info.project.name}: scroll positions ${result.positions.join(", ")}`);
    expect(Math.abs(result.scrollY - result.target)).toBeLessThanOrEqual(1);
    // Instant: no intermediate positions on the way.
    expect(new Set(result.positions.map((y) => Math.round(y))).size).toBe(1);
    expect(await marked(page)).toEqual([]);
  });

  test("the path swap needs no code change: another export's markers and frame range drive the rig", async ({ page }) => {
    const second = buildStandinPath({
      fps: 24,
      firstFrame: 10,
      lastFrame: 250,
      timeOrigin: "frame",
      offset: [5, 2, -3],
      length: 30,
      markers: { CH_port: 10, CH_bus: 40, CH_memory: 100, CH_array: 130, CH_core: 190, CH_uplink: 230 },
    });
    await page.route("**/assets/world/world-path.glb", (route) => route.fulfill({ status: 200, contentType: "model/gltf-binary", body: Buffer.from(second.glb) }));
    await page.route("**/assets/world/world-path.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(second.json) }));
    await page.goto(HIGH);
    await waitForSpine(page);
    const r = await rig(page);
    expect(r).toMatchObject({ fps: 24, firstFrame: 10, lastFrame: 250, starts: [10, 40, 100, 130, 190, 230], problem: null });
    const s = await scroll(page);
    await scrollToY(page, Math.ceil(s.boundaries[3]));
    await waitForCamera(page);
    const at = await rig(page);
    const expected = second.poses.find((p) => p.frame === 130)!;
    console.log(`[path swap] array start: frame ${at.frame.toFixed(2)}, camera ${at.position.map((v) => v.toFixed(3)).join(", ")} (expected ${expected.position.map((v) => v.toFixed(3)).join(", ")})`);
    expect(Math.abs(at.frame - 130)).toBeLessThan(0.5);
    at.position.forEach((v, i) => expect(v).toBeCloseTo(expected.position[i], 1));
  });

  test("the test object stays out of the hero copy along the whole port chapter", async ({ page }, info) => {
    const sizes = info.project.name === "desktop" ? [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }, { width: 844, height: 390 }] : [page.viewportSize()!];
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.goto(HIGH);
      await waitForSpine(page);
      const s = await scroll(page);
      for (const [where, y] of [
        ["start", 0],
        ["mid", Math.round(s.boundaries[1] / 2)],
        ["end", Math.max(0, Math.round(s.boundaries[1]) - 2)],
      ] as const) {
        await scrollToY(page, y);
        await waitForCamera(page);
        await page.waitForTimeout(100);
        const { text, object } = await page.evaluate(() => {
          const copy = document.querySelector<HTMLElement>('[data-over-still="port"]')!;
          // Only what is on screen counts: the visible part of the copy (below the header).
          const view = { left: 0, right: window.innerWidth, top: document.querySelector("header")!.getBoundingClientRect().bottom, bottom: window.innerHeight };
          const t = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
          const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const r of range.getClientRects()) {
              const left = Math.max(r.left, view.left);
              const right = Math.min(r.right, view.right);
              const top = Math.max(r.top, view.top);
              const bottom = Math.min(r.bottom, view.bottom);
              if (right <= left || bottom <= top) continue; // off screen (scrolled away)
              t.left = Math.min(t.left, left);
              t.right = Math.max(t.right, right);
              t.top = Math.min(t.top, top);
              t.bottom = Math.max(t.bottom, bottom);
            }
          }
          return { text: t, object: window.__journey!.objectRect!() };
        });
        const f = (r: typeof text | null) => (r && Number.isFinite(r.left) ? `x ${r.left.toFixed(0)}–${r.right.toFixed(0)} y ${r.top.toFixed(0)}–${r.bottom.toFixed(0)}` : "out of sight");
        console.log(`[object bounds] ${info.project.name} ${size.width}×${size.height} port:${where}: copy on screen ${f(text)} | object ${f(object)}`);
        if (!object || !Number.isFinite(text.left)) continue; // the object is behind the camera, or no copy is on screen
        const overlapX = Math.min(text.right, object.right) - Math.max(text.left, object.left);
        const overlapY = Math.min(text.bottom, object.bottom) - Math.max(text.top, object.top);
        expect(overlapX <= 0 || overlapY <= 0, `${size.width}×${size.height} port:${where}: the object overlaps the hero copy`).toBe(true);
      }
    }
  });

  test("the home page has no accessibility violations with every section see-through over the canvas (axe)", async ({ page }) => {
    await page.goto(HIGH);
    await waitForSpine(page);
    const s = await scroll(page);
    await scrollToY(page, Math.round(s.boundaries[3] + 50));
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-journey-canvas"))).toBe(true);
    // No banner still on a render tier: the canvas shows through every section instead.
    await expect(page.locator("main picture img")).toHaveCount(0);
    await expectNoAxeViolations(page, "home, canvas on, sections see-through");
  });
});

test.describe("static tier keeps stage 1 scrolling (PF-008)", () => {
  test.skip(!JOURNEY_ENABLED, "this build is the production deployment: journey.spec.ts covers it (D-39)");

  test("no smoothing, no spine, no chapter mark; nav links are plain anchors", async ({ page }, info) => {
    const phone = info.project.name === "phone";
    const scripts: string[] = [];
    page.on("response", (r) => {
      if (r.request().resourceType() === "script") scripts.push(r.url());
    });
    // Simple view remembered: the static tier on a plain `/` (a visitor's address, no test query).
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("simple-view", "on");
      } catch {}
    });
    await page.goto("/");
    await page.waitForFunction(() => window.__journey?.state().tier === "static");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => ({ lenis: document.documentElement.classList.contains("lenis"), section: document.documentElement.getAttribute("data-journey-section"), canvas: document.documentElement.hasAttribute("data-journey-canvas"), spine: window.__journey?.scroll ?? null }))).toEqual({
      lenis: false,
      section: null,
      canvas: false,
      spine: null,
    });
    expect(await marked(page)).toEqual([]);
    // A nav link is a plain anchor: the browser jumps (no smooth scroll) and nothing takes focus.
    await openMenuIfPhone(page, phone);
    const before = await page.evaluate(() => window.scrollY);
    await page.locator("header").getByRole("link", { name: "About", exact: true }).click();
    await page.waitForFunction(() => location.hash === "#about");
    await page.waitForFunction((y) => window.scrollY !== y, before, { timeout: 10_000 });
    await page.waitForTimeout(400);
    const landed = await page.evaluate(() => ({
      y: window.scrollY,
      target: document.getElementById("about")!.getBoundingClientRect().top + window.scrollY - (Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0),
      focused: document.activeElement?.id ?? null,
      tabindex: document.getElementById("about")!.getAttribute("tabindex"),
    }));
    expect(Math.abs(landed.y - landed.target)).toBeLessThanOrEqual(1);
    expect(landed.tabindex).toBeNull();
    expect(await marked(page)).toEqual([]);
    // No 3D chunk, so neither gsap nor Lenis was ever requested (both live only in it).
    const bodies = await Promise.all(scripts.map((u) => page.request.get(u).then((r) => r.text())));
    expect(bodies.filter((b) => b.includes("GSAP target") || b.includes("lenis-smooth"))).toEqual([]);
  });
});
