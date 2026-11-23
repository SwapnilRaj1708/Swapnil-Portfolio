import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";

/** The rule sets checked: WCAG 2.0 and 2.1, levels A and AA (axe tags). */
export const WCAG_21_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Runs axe-core on the whole page as it is now (hidden steps are skipped, as assistive
 * technology skips them) and requires zero violations. Finite animations (a step sliding in) are
 * waited out first, so colour contrast is measured on the settled page; endless ones (the status
 * dot's pulse) are left running.
 *
 * Prints `[axe] <project> <state>: …` with the counts and any node axe could not decide
 * ("needs review", for a person to check), and attaches the same to the test report.
 */
export async function expectNoAxeViolations(page: Page, state: string) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  // Legacy mode: one axe.run in the page. The default mode opens an extra page per scan to join
  // per-frame results – these pages have no frames, and that page made each scan several seconds
  // slower under a full parallel run.
  const results = await new AxeBuilder({ page }).withTags(WCAG_21_AA).setLegacyMode(true).analyze();
  const project = test.info().project.name;
  // Why axe left a node undecided, e.g. `pseudoContent`, `elmPartiallyObscured`, `bgOverlap`.
  const reason = (n: (typeof results.incomplete)[number]["nodes"][number]) =>
    [...n.any, ...n.all, ...n.none].map((c) => (c.data as { messageKey?: string } | null)?.messageKey ?? c.id).join("/");
  const incomplete = results.incomplete
    .map((r) => `${r.id} (${r.nodes.map((n) => `${n.target.join(" ")} [${reason(n)}]`).join(" | ")})`)
    .join(", ");
  const line = `${state}: ${results.violations.length} violations, ${results.passes.length} rules passed${incomplete ? `; needs review: ${incomplete}` : ""}`;
  console.log(`[axe] ${project} ${line}`);
  test.info().annotations.push({ type: "axe", description: line });
  const detail = results.violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `  ${n.target.join(" ")} – ${n.failureSummary}`).join("\n")}`)
    .join("\n\n");
  expect(results.violations, `axe violations on "${state}":\n${detail}`).toEqual([]);
}

/** The `noscript:` variant as the built stylesheet writes it (Tailwind: `@media (scripting: none)`). */
const SCRIPTING_NONE = /\(\s*scripting\s*:\s*none\s*\)/g;

/**
 * A page that renders a URL the way a browser without JavaScript does, but in which axe can run.
 *
 * axe needs the page's timers, and with JavaScript disabled they never fire, so the plain form
 * cannot be scanned in place (axe waits forever). This page has JavaScript on, but every document
 * arrives with its `<script>` elements removed (nothing runs, nothing hydrates) and every
 * stylesheet with `(scripting: none)` turned on – Chromium cannot emulate that media feature. The
 * caller compares it with the real JavaScript-off page (`expectSameAsWithoutJavaScript`) before
 * trusting a scan of it.
 */
export async function openWithoutScripts(browser: Browser): Promise<{ page: Page; close: () => Promise<void>; rewrites: () => number }> {
  const use = test.info().project.use;
  const context = await browser.newContext({
    // Explicit: inside a `javaScriptEnabled: false` block Playwright Test passes that option on to
    // new contexts as a default, and axe would wait forever again.
    javaScriptEnabled: true,
    baseURL: use.baseURL,
    viewport: use.viewport,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
  });
  let rewrites = 0;
  await context.route("**/*", async (route) => {
    const type = route.request().resourceType();
    if (type === "script") return route.abort();
    if (type !== "document" && type !== "stylesheet") return route.continue();
    const response = await route.fetch();
    let body = await response.text();
    if (type === "document") {
      body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    } else {
      body = body.replace(SCRIPTING_NONE, () => {
        rewrites++;
        return "(min-width: 0px)";
      });
    }
    // The body is now plain text of another length: drop the encoding and length headers.
    const headers = { ...response.headers() };
    delete headers["content-encoding"];
    delete headers["content-length"];
    await route.fulfill({ status: response.status(), headers, body });
  });
  const page = await context.newPage();
  return { page, close: () => context.close(), rewrites: () => rewrites };
}

/**
 * Proves the script-free copy is what a visitor without JavaScript gets: no script ran, the
 * `noscript:` rules are on, and the accessibility tree of the whole page equals the real
 * JavaScript-off page's.
 */
export async function expectSameAsWithoutJavaScript(copy: Page, real: Page, rewrites: number) {
  expect(rewrites, "the stylesheet's (scripting: none) rules were turned on").toBeGreaterThan(0);
  expect(await copy.evaluate(() => "__next_f" in self), "no page script ran in the copy").toBe(false);
  expect(await copy.locator("body").ariaSnapshot()).toBe(await real.locator("body").ariaSnapshot());
}
