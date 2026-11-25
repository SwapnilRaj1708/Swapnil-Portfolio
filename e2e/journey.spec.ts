import { expect, type Page, test } from "./fixtures";
import { JOURNEY_ENABLED } from "../src/config/journey";
import { identity } from "../src/content/data/identity";
import type { JourneyDebug } from "../src/lib/journey/debug";
import { expectNoAxeViolations } from "./axe";

// PF-007: the persistent canvas, the quality tiers and every way to the static tier.
//
// The test process shares the web server's environment (playwright.config.ts), so JOURNEY_ENABLED
// here is the build's state: a normal local or CI build has the 3D layer; a build made with
// VERCEL_ENV=production does not (D-39) and runs only the last group.
//
// CI and Playwright's headless shell render with SwiftShader (software). A software renderer is a
// static trigger, so `/` without a query lands in the static tier there. Every test that needs the
// canvas forces a tier with `?tier=` (allowed off production; it bypasses the software-renderer
// trigger, the low-tier failure and the downgrade) or pretends a hardware GPU (`pretendHardwareGpu`)
// to test the automatic rules. Nothing here depends on rendered pixels.

/** Strings only the 3D chunk contains (three.js core, React Three Fiber). */
const SIGNATURES = ["__THREE__", "R3F: Hooks can only be used"];

type ChunkWatch = { seen: string[]; release: () => void };

/**
 * Watches every JavaScript chunk the page loads and recognises the 3D chunk by its content.
 * `hold` keeps it from arriving until `release()`; `abort` fails it.
 */
async function watchChunks(page: Page, mode: "pass" | "hold" | "abort" = "pass"): Promise<ChunkWatch> {
  const seen: string[] = [];
  let release = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/_next\/static\/chunks\/.+\.js(\?.*)?$/, async (route) => {
    let response: Awaited<ReturnType<typeof route.fetch>>;
    let body: Buffer;
    try {
      // Retries a connection reset (the local server under a full parallel run).
      response = await route.fetch({ maxRetries: 3 });
      body = await response.body();
    } catch {
      // The request went away (navigation, the page closing) or the proxy lost it: let the browser
      // have it as it is. The static-tier tests also check the loader's own `journey:chunk-request`.
      await route.continue().catch(() => undefined);
      return;
    }
    if (SIGNATURES.some((s) => body.includes(s))) {
      seen.push(route.request().url());
      if (mode === "abort") return route.abort();
      if (mode === "hold") await released;
    }
    await route.fulfill({ response, body });
  });
  return { seen, release };
}

/** Console errors and page errors; a failed resource is judged by the test itself. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource")) errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

function debug(page: Page) {
  return {
    state: () => page.evaluate(() => window.__journey?.state() ?? null),
    frames: () => page.evaluate(() => window.__journey?.frames ?? -1),
    field: <K extends keyof JourneyDebug>(key: K) => page.evaluate((k) => window.__journey?.[k] ?? null, key) as Promise<JourneyDebug[K] | null>,
  };
}

async function waitForCanvas(page: Page) {
  await page.waitForFunction(() => window.__journey?.ready === true, null, { timeout: 30_000 });
  await expect(page.locator("[data-journey-host]")).toHaveAttribute("data-shown", "");
}

async function waitForTier(page: Page, tier: string) {
  await page.waitForFunction((t) => window.__journey?.state().tier === t, tier, { timeout: 30_000 });
}

/** The static home as in stage 1: no canvas, the hero still drawn (loaded), the text there. */
async function expectStaticHome(page: Page) {
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("[data-journey-host]")).toHaveCount(0);
  const still = page.locator("section#top picture img");
  await expect(still).toHaveAttribute("loading", "eager");
  await expect(still).toHaveAttribute("fetchpriority", "high");
  await expect.poll(() => still.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 20_000 }).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: identity.name })).toBeVisible();
}

/** The loader's own mark: set just before it imports the 3D chunk. */
function chunkRequested(page: Page) {
  return page.evaluate(() => performance.getEntriesByName("journey:chunk-request").length > 0);
}

/** Gives the loader every chance to request the chunk (load, idle, its 2 s timeout). */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);
}

/**
 * Makes the browser report a capable hardware GPU, so the automatic rules (start tier, downgrade,
 * low-tier failure) run even on SwiftShader: WebGL contexts are created without the performance
 * caveat, the unmasked renderer reads "Test GPU (hardware)", and memory and cores read 8.
 */
function pretendHardwareGpu(page: Page) {
  return page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attrs?: Record<string, unknown>) {
      const options = attrs ? { ...attrs, failIfMajorPerformanceCaveat: false } : attrs;
      const gl = getContext.call(this, type as "webgl2", options) as WebGL2RenderingContext | null;
      if (gl && type === "webgl2") {
        const getParameter = gl.getParameter.bind(gl);
        gl.getParameter = ((p: number) => (p === 0x9246 ? "Test GPU (hardware)" : getParameter(p))) as typeof gl.getParameter;
      }
      return gl;
    } as typeof HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 8, configurable: true });
    Object.defineProperty(navigator, "deviceMemory", { value: 8, configurable: true });
  });
}

/** The unmasked WebGL 2 renderer this browser gives a page (as the probe reads it), or null. */
function browserRenderer(page: Page) {
  return page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return null;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return renderer;
  });
}

test.describe("3D layer (previews, local builds)", () => {
  test.skip(!JOURNEY_ENABLED, "this build is the production deployment: the 3D layer is not built in (D-39)");
  // Several canvases render in software (SwiftShader) at once in a parallel run: generous budget.
  test.describe.configure({ timeout: 90_000 });

  test.describe("render tiers", () => {
    test("the canvas is a fixed, hidden, non-interactive layer behind the page; the hero still is not downloaded", async ({ page }) => {
      const errors = collectErrors(page);
      const images: string[] = [];
      page.on("request", (r) => {
        if (r.url().includes("/_next/image")) images.push(decodeURIComponent(r.url()));
      });
      const chunks = await watchChunks(page);
      await page.goto("/?tier=low");
      await waitForCanvas(page);
      const state = await debug(page).state();
      expect(state?.tier).toBe("low");
      expect(chunks.seen.length).toBeGreaterThan(0);

      const layer = await page.locator("[data-journey-host]").evaluate((host) => {
        const style = getComputedStyle(host);
        const canvas = host.querySelector("canvas")!;
        return {
          ariaHidden: host.getAttribute("aria-hidden"),
          position: style.position,
          zIndex: Number(style.zIndex),
          pointerEvents: style.pointerEvents,
          canvasFocusable: canvas.tabIndex >= 0,
          size: [Math.round(host.getBoundingClientRect().width), Math.round(host.getBoundingClientRect().height)],
          canvases: document.querySelectorAll("canvas").length,
          // What the browser paints at the middle of the hero's right side: the canvas (nothing opaque above it).
          painted: (() => {
            const el = document.elementsFromPoint(window.innerWidth * 0.8, window.innerHeight * 0.6);
            return el.includes(canvas) && el.indexOf(canvas) < el.indexOf(document.body);
          })(),
        };
      });
      const vp = page.viewportSize()!;
      expect(layer).toEqual({
        ariaHidden: "true",
        position: "fixed",
        zIndex: -10,
        pointerEvents: "none",
        canvasFocusable: false,
        size: [vp.width, vp.height],
        canvases: 1,
        painted: true,
      });
      // The Port still: not in the DOM, not requested (the canvas stands in for it).
      await expect(page.locator("section#top picture img")).toHaveCount(0);
      expect(images.filter((u) => u.includes("still-s1-port"))).toEqual([]);
      expect(errors).toEqual([]);
    });

    test("the page is interactive before the 3D chunk is requested", async ({ page }, info) => {
      // Notes when React has hydrated the contact flow (its Next button is disabled until then).
      await page.addInitScript(() => {
        const w = window as Window & { __hydratedAt?: number };
        const check = () => {
          const next = document.querySelector<HTMLButtonElement>("#contact form button[type=submit]");
          if (next && !next.disabled && w.__hydratedAt === undefined) w.__hydratedAt = performance.now();
        };
        new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true });
      });
      const chunks = await watchChunks(page, "hold");
      await page.goto("/?tier=low");
      // While the 3D chunk is held back, the page works: hydrated controls respond.
      await expect(page.locator("#contact form button[type=submit]").first()).toBeEnabled();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
      if (info.project.name === "phone") {
        const menu = page.getByRole("button", { name: "Menu" });
        await menu.click();
        await expect(menu).toHaveAttribute("aria-expanded", "true");
        await page.keyboard.press("Escape");
        await expect(menu).toHaveAttribute("aria-expanded", "false");
      }
      await expect.poll(() => chunks.seen.length, { timeout: 15_000 }).toBeGreaterThan(0);
      await expect(page.locator("canvas")).toHaveCount(0);

      const t = await page.evaluate(() => ({
        load: performance.getEntriesByType("navigation")[0] && (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).loadEventEnd,
        hydrated: (window as Window & { __hydratedAt?: number }).__hydratedAt ?? -1,
        request: performance.getEntriesByName("journey:chunk-request")[0]?.startTime ?? -1,
      }));
      console.log(`[journey timing] ${info.project.name}: load end ${t.load.toFixed(0)} ms, hydrated ${t.hydrated.toFixed(0)} ms, 3D chunk requested ${t.request.toFixed(0)} ms`);
      expect(t.hydrated).toBeGreaterThan(0);
      expect(t.request).toBeGreaterThanOrEqual(t.load);
      expect(t.request).toBeGreaterThan(t.hydrated);

      chunks.release();
      await waitForCanvas(page);
    });

    test("no request leaves the site's own origin", async ({ page, baseURL }) => {
      const outside: string[] = [];
      const origin = new URL(baseURL!).origin;
      page.on("request", (r) => {
        const url = r.url();
        if (!url.startsWith(origin) && !url.startsWith("data:") && !url.startsWith("blob:")) outside.push(url);
      });
      await page.goto("/?tier=low");
      await waitForCanvas(page);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      expect(outside).toEqual([]);
    });

    test("no frames while the tab is hidden", async ({ page }) => {
      await page.addInitScript(() => {
        let hidden = false;
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
        (window as Window & { __setHidden?: (h: boolean) => void }).__setHidden = (h) => {
          hidden = h;
          document.dispatchEvent(new Event("visibilitychange"));
        };
      });
      await page.goto("/?tier=low");
      await waitForCanvas(page);
      const d = debug(page);
      await expect.poll(d.frames, { timeout: 15_000 }).toBeGreaterThan(5);
      await page.evaluate(() => (window as Window & { __setHidden?: (h: boolean) => void }).__setHidden!(true));
      await page.waitForTimeout(200);
      const hiddenAt = await d.frames();
      await page.waitForTimeout(1500);
      expect(await d.frames()).toBe(hiddenAt);
      await page.evaluate(() => (window as Window & { __setHidden?: (h: boolean) => void }).__setHidden!(false));
      await expect.poll(d.frames, { timeout: 15_000 }).toBeGreaterThan(hiddenAt + 5);
    });

    test("no frames while the canvas is covered: below the hero, and on pages without a see-through section", async ({ page }) => {
      await page.goto("/?tier=low");
      await waitForCanvas(page);
      const d = debug(page);
      const host = page.locator("[data-journey-host]");
      // Scrolled past the hero: every other section is opaque.
      await page.locator("#experience").evaluate((el) => el.scrollIntoView());
      await expect(host).not.toHaveAttribute("data-shown");
      await page.waitForTimeout(200);
      const covered = await d.frames();
      await page.waitForTimeout(1500);
      expect(await d.frames()).toBe(covered);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(host).toHaveAttribute("data-shown", "");
      await expect.poll(d.frames, { timeout: 15_000 }).toBeGreaterThan(covered + 5);

      // A client navigation to /work: the canvas stays mounted (persistent) but hidden and paused.
      await page.locator('header a[href="/work"]:visible').first().click();
      await page.waitForURL("**/work");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator("canvas")).toHaveCount(1);
      await expect(host).not.toHaveAttribute("data-shown");
      await page.waitForTimeout(200);
      const onWork = await d.frames();
      await page.waitForTimeout(1500);
      expect(await d.frames()).toBe(onWork);
    });

    test("a page without a see-through section never downloads the 3D chunk", async ({ page }) => {
      const chunks = await watchChunks(page);
      await page.goto("/work");
      await settle(page);
      expect(chunks.seen).toEqual([]);
      await expect(page.locator("canvas")).toHaveCount(0);
    });

    test("?tier= forces a tier and caps the pixel ratio (STANDARDS §3)", async ({ page }, info) => {
      const deviceRatio = info.project.use.deviceScaleFactor ?? 1;
      for (const [tier, cap] of [
        ["high", 2],
        ["medium", 1.5],
        ["low", 1],
      ] as const) {
        await page.goto(`/?tier=${tier}`);
        await waitForCanvas(page);
        const state = await debug(page).state();
        expect(state).toMatchObject({ tier, forced: true, reason: "override" });
        const stats = await page.evaluate(() => window.__journey!.stats!());
        expect(stats.pixelRatio).toBe(Math.min(deviceRatio, cap));
        expect(stats.drawCalls).toBeGreaterThan(0);
        expect(stats.drawCalls).toBeLessThanOrEqual({ high: 120, medium: 90, low: 60 }[tier]);
        expect(stats.triangles).toBeLessThanOrEqual({ high: 600_000, medium: 350_000, low: 150_000 }[tier]);
      }
    });

    test("the tier drops under load and never climbs back within the visit", async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "starts from high: a desktop device");
      test.setTimeout(120_000);
      // Report a capable hardware GPU, so the start tier is high even on a software renderer.
      await pretendHardwareGpu(page);
      await page.goto("/");
      await waitForCanvas(page);
      expect(await debug(page).state()).toMatchObject({ tier: "high", reason: "capable device", forced: false });

      // 60 ms of extra work in every frame: far over high's 16.7 ms.
      await page.evaluate(() => (window.__journey!.loadMs = 60));
      await waitForTier(page, "medium");
      await page.evaluate(() => (window.__journey!.loadMs = 0));
      await page.waitForTimeout(8000);
      // Light again, but it stays medium (or lower), never high.
      const after = await debug(page).state();
      expect(["medium", "low"]).toContain(after?.tier);
      expect(after?.history.map((h) => h.tier)).not.toContain("static");
      expect(after?.history.filter((h) => h.tier === "high")).toHaveLength(1);
      expect(await page.evaluate(() => sessionStorage.getItem("journey-tier-floor"))).toMatch(/medium|low/);

      // A reload in the same session starts at the floor, not at high.
      await page.reload();
      await waitForCanvas(page);
      const reloaded = await debug(page).state();
      expect(["medium", "low"]).toContain(reloaded?.tier);
      expect(reloaded?.reason).toMatch(/session floor/);
    });

    test("the test object stays out of the hero copy", async ({ page }, info) => {
      test.setTimeout(120_000);
      const sizes = info.project.name === "desktop" ? [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }, { width: 1280, height: 800 }, { width: 844, height: 390 }, { width: 768, height: 1024 }] : [page.viewportSize()!];
      for (const size of sizes) {
        await page.setViewportSize(size);
        await page.goto("/?tier=low");
        await waitForCanvas(page);
        await page.waitForTimeout(300);
        const found = await page.evaluate(() => {
          const copy = document.querySelector<HTMLElement>('[data-over-still="port"]')!;
          const t = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
          const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const r of range.getClientRects()) {
              if (!r.width || !r.height) continue;
              t.left = Math.min(t.left, r.left);
              t.right = Math.max(t.right, r.right);
              t.top = Math.min(t.top, r.top);
              t.bottom = Math.max(t.bottom, r.bottom);
            }
          }
          return { text: t, object: window.__journey!.objectRect!()! };
        });
        const { text, object } = found;
        const overlapX = Math.min(text.right, object.right) - Math.max(text.left, object.left);
        const overlapY = Math.min(text.bottom, object.bottom) - Math.max(text.top, object.top);
        const f = (r: typeof text) => `x ${r.left.toFixed(0)}–${r.right.toFixed(0)} y ${r.top.toFixed(0)}–${r.bottom.toFixed(0)}`;
        console.log(`[object bounds] ${info.project.name} ${size.width}×${size.height}: copy ${f(text)} | object ${f(object)}`);
        expect(overlapX <= 0 || overlapY <= 0, `${size.width}×${size.height}: the object overlaps the hero copy`).toBe(true);
      }
    });

    test("frame time failing at low sends the session to the static tier (simulated frame times)", async ({ page }) => {
      test.setTimeout(120_000);
      const errors = collectErrors(page);
      // A hardware GPU whose session was already lowered to low: the automatic low tier.
      await pretendHardwareGpu(page);
      await page.addInitScript(() => {
        try {
          if (!sessionStorage.getItem("journey-low-failed")) sessionStorage.setItem("journey-tier-floor", "low");
        } catch {}
      });
      await page.goto("/");
      await waitForCanvas(page);
      expect(await debug(page).state()).toMatchObject({ tier: "low", forced: false });

      // The monitor sees 60 ms frames (low's limit is 33 ms × 1.1); the machine is not slowed.
      const start = Date.now();
      await page.evaluate(() => (window.__journey!.simulatedFrameMs = 60));
      await waitForTier(page, "static");
      const state = await debug(page).state();
      console.log(`[journey low failure] static after ${Date.now() - start} ms real time; history ${state?.history.map((h) => `${h.tier}:${h.reason}`).join(" → ")}`);
      expect(state?.reason).toBe("low-failed");
      expect(state?.history.map((h) => h.tier)).toEqual(["low", "static"]);
      expect(await page.evaluate(() => sessionStorage.getItem("journey-low-failed"))).toBe("1");
      await expectStaticHome(page);

      // Remembered for the session: a reload stays static and never requests the chunk.
      const chunks = await watchChunks(page);
      await page.reload();
      await waitForTier(page, "static");
      await settle(page);
      expect((await debug(page).state())?.reason).toBe("low-failed");
      expect(chunks.seen).toEqual([]);
      expect(await chunkRequested(page)).toBe(false);
      await expectStaticHome(page);

      // ?tier= bypasses it (tests and captures still get the canvas in this session).
      await page.goto("/?tier=low");
      await waitForCanvas(page);
      expect(await debug(page).state()).toMatchObject({ tier: "low", forced: true, reason: "override" });
      expect(errors).toEqual([]);
    });

    test("a forced tier is never lowered or ended by slow frames (?tier=low)", async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto("/?tier=low");
      await waitForCanvas(page);
      await page.evaluate(() => (window.__journey!.simulatedFrameMs = 60));
      const from = await debug(page).frames();
      // 400 frames × 60 ms = 24 s of simulated frame time: far past warm-up, window and 5 s sustain.
      await expect.poll(debug(page).frames, { timeout: 90_000 }).toBeGreaterThan(from + 400);
      expect(await debug(page).state()).toMatchObject({ tier: "low", forced: true, reason: "override" });
      expect((await debug(page).state())?.history).toHaveLength(1);
      expect(await page.evaluate(() => sessionStorage.getItem("journey-low-failed"))).toBeNull();
    });

    test("the home page has no accessibility violations with the canvas on (axe)", async ({ page }) => {
      await page.goto("/?tier=low");
      await waitForCanvas(page);
      await expectNoAxeViolations(page, "home, canvas on");
    });
  });

  test.describe("a software renderer – the visitor gets the static tier", () => {
    test("this browser's own renderer (SwiftShader in CI and the headless shell) → static, nothing of the 3D layer downloaded", async ({ page }, info) => {
      const errors = collectErrors(page);
      const chunks = await watchChunks(page);
      await page.goto("/");
      const renderer = await browserRenderer(page);
      test.skip(!/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer ?? ""), `this browser has a hardware renderer (${renderer})`);
      await waitForTier(page, "static");
      await settle(page);
      expect(await debug(page).state()).toMatchObject({ tier: "static", reason: "software-renderer", forced: false });
      await expectStaticHome(page);
      expect(chunks.seen).toEqual([]);
      expect(await chunkRequested(page)).toBe(false);
      expect(errors).toEqual([]);

      // What the page had loaded when the tier was decided (resource timing up to the loader's
      // `journey:decided` mark): the document, the stylesheet, fonts and the first-load scripts –
      // the loader's own small chunk among them – but nothing of three.js or the scene.
      const before = await page.evaluate(() => {
        const decided = performance.getEntriesByName("journey:decided")[0]?.startTime ?? -1;
        const resources = performance
          .getEntriesByType("resource")
          .filter((e) => e.startTime <= decided)
          .map((e) => {
            const r = e as PerformanceResourceTiming;
            return { path: new URL(r.name).pathname, type: r.initiatorType, bytes: r.encodedBodySize };
          });
        return { decided, resources };
      });
      console.log(
        `[journey detection] ${info.project.name}: renderer "${renderer}"; decided at ${before.decided.toFixed(0)} ms after ` +
          `${before.resources.length} resources:\n${before.resources.map((r) => `  ${r.type} ${r.path} (${r.bytes} B)`).join("\n")}`,
      );
      expect(before.decided).toBeGreaterThan(0);
    });
  });

  test.describe("static triggers – each shows the stage 1 home, no canvas, no 3D chunk", () => {
    const CASES: { name: string; reason: string; path?: string; setup?: (page: Page) => Promise<unknown> }[] = [
      { name: "reduced motion", reason: "reduced-motion", setup: (page) => page.emulateMedia({ reducedMotion: "reduce" }) },
      {
        name: "data saver",
        reason: "save-data",
        setup: (page) => page.addInitScript(() => Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true })),
      },
      {
        name: "no WebGL 2",
        reason: "no-webgl2",
        setup: (page) =>
          page.addInitScript(() => {
            const getContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
              return type === "webgl2" ? null : (getContext as (...a: unknown[]) => unknown).call(this, type, ...rest);
            } as typeof HTMLCanvasElement.prototype.getContext;
          }),
      },
      {
        // The override bypasses the software renderer and the low-tier failure, never this.
        name: "no WebGL 2, with a forced tier (?tier=high)",
        reason: "no-webgl2",
        path: "/?tier=high",
        setup: (page) =>
          page.addInitScript(() => {
            const getContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
              return type === "webgl2" ? null : (getContext as (...a: unknown[]) => unknown).call(this, type, ...rest);
            } as typeof HTMLCanvasElement.prototype.getContext;
          }),
      },
      {
        // A software renderer named in the renderer string, with the performance caveat not
        // reported – the string alone decides (deterministic on any machine).
        name: "a software renderer by name (Microsoft Basic Render Driver)",
        reason: "software-renderer",
        setup: (page) =>
          page.addInitScript(() => {
            const getContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attrs?: Record<string, unknown>) {
              const options = attrs ? { ...attrs, failIfMajorPerformanceCaveat: false } : attrs;
              const gl = getContext.call(this, type as "webgl2", options) as WebGL2RenderingContext | null;
              if (gl && type === "webgl2") {
                const getParameter = gl.getParameter.bind(gl);
                gl.getParameter = ((p: number) =>
                  p === 0x9246 ? "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)" : getParameter(p)) as typeof gl.getParameter;
              }
              return gl;
            } as typeof HTMLCanvasElement.prototype.getContext;
          }),
      },
      {
        name: "simple view remembered from an earlier visit",
        reason: "simple-view",
        setup: (page) =>
          page.addInitScript(() => {
            try {
              window.localStorage.setItem("simple-view", "on");
            } catch {}
          }),
      },
      { name: "?tier=static", reason: "override", path: "/?tier=static" },
    ];

    for (const c of CASES) {
      test(c.name, async ({ page }) => {
        const errors = collectErrors(page);
        const chunks = await watchChunks(page);
        await c.setup?.(page);
        await page.goto(c.path ?? "/");
        await waitForTier(page, "static");
        await settle(page);
        expect((await debug(page).state())?.reason).toBe(c.reason);
        await expectStaticHome(page);
        expect(chunks.seen).toEqual([]);
        expect(await chunkRequested(page)).toBe(false);
        expect(errors).toEqual([]);
      });
    }

    test("the 3D chunk fails to load", async ({ page }) => {
      const errors = collectErrors(page);
      const chunks = await watchChunks(page, "abort");
      await page.goto("/?tier=low");
      await waitForTier(page, "static");
      expect((await debug(page).state())?.reason).toBe("chunk-failed");
      expect(chunks.seen.length).toBeGreaterThan(0);
      await expectStaticHome(page);
      // No error overlay, nothing thrown: the browser's own "Failed to load resource" line is all.
      expect(errors).toEqual([]);
    });

    test("the graphics context is lost twice (the first loss is restored)", async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto("/?tier=low");
      await waitForCanvas(page);
      const d = debug(page);
      const lose = () =>
        page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>("[data-journey-host] canvas")!;
          const ext = (canvas.getContext("webgl2") as WebGL2RenderingContext).getExtension("WEBGL_lose_context")!;
          ext.loseContext();
          return new Promise<void>((resolve) => setTimeout(() => (ext.restoreContext(), resolve()), 300));
        });
      await lose();
      // Restored: still a render tier, and frames come again.
      const afterFirst = await d.frames();
      await expect.poll(d.frames, { timeout: 15_000 }).toBeGreaterThan(afterFirst + 5);
      expect((await d.state())?.tier).toBe("low");
      await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>("[data-journey-host] canvas")!;
        (canvas.getContext("webgl2") as WebGL2RenderingContext).getExtension("WEBGL_lose_context")!.loseContext();
      });
      await waitForTier(page, "static");
      expect((await d.state())?.reason).toBe("context-lost");
      await expectStaticHome(page);

      // Remembered for the session: a reload stays static and never requests the chunk.
      const chunks = await watchChunks(page);
      await page.reload();
      await waitForTier(page, "static");
      await settle(page);
      expect((await d.state())?.reason).toBe("context-lost");
      expect(chunks.seen).toEqual([]);
      await expectStaticHome(page);
      expect(errors).toEqual([]);
    });

    test("simple view chosen with the switch: the canvas unmounts and frees the GPU; off brings it back", async ({ page }, info) => {
      const errors = collectErrors(page);
      await page.goto("/?tier=low");
      await waitForCanvas(page);
      // On the phone the switch sits in the menu.
      const toggle = async (pressed: "true" | "false") => {
        const phone = info.project.name === "phone";
        if (phone) await page.getByRole("button", { name: "Menu" }).click();
        const button = page.getByRole("button", { name: "Simple view" });
        await button.click();
        await expect(button).toHaveAttribute("aria-pressed", pressed);
        if (phone) await page.keyboard.press("Escape");
      };
      await toggle("true");
      await waitForTier(page, "static");
      expect((await debug(page).state())?.reason).toBe("simple-view");
      await expectStaticHome(page);
      // Everything the renderer held is released (read after React Three Fiber's teardown).
      await expect.poll(() => debug(page).field("lastRelease"), { timeout: 10_000 }).not.toBeNull();
      const release = await debug(page).field("lastRelease");
      console.log(`[journey release] ${info.project.name}: ${JSON.stringify(release)}`);
      expect(release).toMatchObject({ geometries: 0, textures: 0, programs: 0, contextLost: true });

      // Remembered: a reload stays static without requesting the chunk (simple view wins over
      // the forced tier).
      const chunks = await watchChunks(page);
      await page.goto("/?tier=low");
      await waitForTier(page, "static");
      await settle(page);
      expect((await debug(page).state())?.reason).toBe("simple-view");
      expect(chunks.seen).toEqual([]);
      await expectStaticHome(page);

      // Off again: the tier checks run again and the canvas comes back.
      await toggle("false");
      await waitForCanvas(page);
      expect(["high", "medium", "low"]).toContain((await debug(page).state())?.tier);
      await expect(page.locator("section#top picture img")).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });
});

test.describe("production deployment (D-39): the stage 1 home, no 3D layer", () => {
  test.skip(JOURNEY_ENABLED, "this build has the 3D layer (not built as the production deployment)");

  for (const path of ["/", "/?tier=high"]) {
    test(`${path} loads no 3D chunk, renders no canvas and keeps the stage 1 hero`, async ({ page, request }) => {
      const errors = collectErrors(page);
      const chunks = await watchChunks(page);
      const scripts: string[] = [];
      page.on("response", (r) => {
        if (r.request().resourceType() === "script") scripts.push(r.url());
      });
      await page.goto(path);
      await settle(page);
      expect(chunks.seen).toEqual([]);
      expect(scripts.length).toBeGreaterThan(0);
      await expect(page.locator("canvas")).toHaveCount(0);
      await expect(page.locator("[data-journey-host], [data-tier-backdrop]")).toHaveCount(0);
      expect(await page.evaluate(() => "__journey" in window)).toBe(false);
      await expectStaticHome(page);
      // In the server HTML: the hero still itself (not inside <noscript>), at high priority.
      const html = await (await request.get("/")).text();
      expect(html).toMatch(/<section[^>]*id="top"[^>]*class="[^"]*bg-background/);
      expect(html).not.toContain("<noscript><div aria-hidden");
      expect(errors).toEqual([]);
    });
  }
});
