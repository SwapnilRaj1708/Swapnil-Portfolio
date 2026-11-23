import { expect, type Page, test } from "@playwright/test";
import { contactFlow } from "../src/content/data/contact-flow";
import { ui } from "../src/content/data/ui";
import { expectNoAxeViolations, expectSameAsWithoutJavaScript, openWithoutScripts } from "./axe";

// Contact flow "Transmission" (PF-019). With JavaScript, sending is mocked (page.route) – no test
// here reaches the mail service. The JavaScript-off tests post to the real endpoint, whose mail
// client points at a closed local port in this test server (playwright.config.ts), so even a valid
// post can only end in "failed".
//
// Accessibility: axe-core (WCAG 2.1 A/AA rules, e2e/axe.ts) runs on every step of one full run per
// intent, on the success and failure states, inline errors, the plain form and its result pages
// (scanned in a script-free copy, see below) – in both projects (desktop and phone). Zero
// violations.

const t = ui.transmission;
const AUTO_ADVANCE_MS = 1200;

// Every run waits out real auto-advance pauses; under a full parallel run pages also load slowly.
test.describe.configure({ timeout: 60_000 });

/** Picks an option the way a person does: by its chip (the label around the radio). */
async function choose(page: Page, name: string) {
  await page.locator("#contact label").filter({ has: page.getByRole("radio", { name, exact: true }) }).click();
}

/** The flow is interactive once its script has run (Next is disabled until then). */
async function openFlow(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: new RegExp(t.next) })).toBeEnabled();
}

/** Every visible step is a labelled, named thing: no unnamed control, its heading present. */
async function checkStep(page: Page, heading: string) {
  const step = page.locator("#contact [data-step]:visible");
  await expect(step).toHaveCount(1);
  // Focus moved to the new question's heading.
  await expect(page.locator(":focus")).toHaveText(heading);
  await expect(page.locator(":focus")).toHaveRole("heading");
  const snapshot = await step.ariaSnapshot();
  expect(snapshot, snapshot).toContain(`heading "${heading}" [level=4]`);
  // Unnamed controls would appear as a bare role, e.g. `- radio` or `- textbox [`.
  expect(snapshot, snapshot).not.toMatch(/^\s*- (radio|textbox|button|link|checkbox)\s*(\[[^\]]*\])?:?\s*$/m);
  // The navigation buttons carry names too.
  const form = page.getByRole("form", { name: t.label });
  for (const button of await form.getByRole("button").all()) {
    if (await button.isVisible()) expect((await button.textContent())?.trim()).toBeTruthy();
  }
  test.info().annotations.push({ type: "a11y snapshot", description: `${heading}\n${snapshot}` });
}

/** Tabs from the top of the page into the flow's first option (keyboard only). */
async function tabIntoFlow(page: Page) {
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press("Tab");
    const inFlow = await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement | null;
      return el?.name === "intent";
    });
    if (inFlow) return;
  }
  throw new Error("Tab never reached the contact flow");
}

/** Mocks the endpoint; returns what was posted. */
async function mockSend(page: Page) {
  const posted: string[] = [];
  await page.route("**/api/contact", async (route) => {
    posted.push(route.request().postData() ?? "");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  return posted;
}

async function countSentEvents(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __sent: unknown[] }).__sent = [];
    window.addEventListener("transmission:sent", (e) => (window as unknown as { __sent: unknown[] }).__sent.push((e as CustomEvent).detail));
  });
}

type Run = { intent: string; key: string; details: { heading: string; act: (page: Page) => Promise<void> }[] };

const pickByNumber = (n: number) => async (page: Page) => {
  await page.keyboard.press("Tab"); // from the heading into the group
  await page.keyboard.press(String(n));
};

const RUNS: Run[] = [
  {
    intent: "hiring",
    key: "1",
    details: [
      { heading: "Kind of role", act: pickByNumber(1) },
      { heading: "Work mode", act: pickByNumber(2) },
    ],
  },
  {
    intent: "freelance",
    key: "2",
    details: [
      { heading: "Kind of project", act: pickByNumber(2) },
      {
        heading: "Budget range",
        act: async (page) => {
          const budget = page.getByRole("group", { name: "Budget range" });
          await expect(budget.getByText("under ₹50k")).toBeVisible();
          await expect(budget.getByText("under $600")).toBeHidden();
          // ₹ / $ toggle with the keyboard: Tab into the currency group, arrow to $.
          await page.keyboard.press("Tab");
          await expect(page.getByRole("radio", { name: "₹ INR" })).toBeFocused();
          await page.keyboard.press("ArrowRight");
          await expect(page.getByRole("radio", { name: "$ USD" })).toBeChecked();
          await expect(budget.getByText("under $600")).toBeVisible();
          await expect(budget.getByText("under ₹50k")).toBeHidden();
          // Arrow keys never auto-advance.
          await page.waitForTimeout(AUTO_ADVANCE_MS + 300);
          await expect(page.locator(":focus")).toHaveRole("radio");
          await page.keyboard.press("Tab");
          await page.keyboard.press("3");
          await expect(budget.getByRole("radio", { name: "$2,400+" })).toBeChecked();
        },
      },
      { heading: "Timeline", act: pickByNumber(1) },
    ],
  },
  { intent: "collaboration", key: "3", details: [{ heading: "Kind of collaboration", act: pickByNumber(1) }] },
  { intent: "hello", key: "4", details: [] },
];

test.describe("contact flow with the keyboard only (sending mocked)", () => {
  for (const run of RUNS) {
    test(`${run.intent}: every step, under a minute, focus on each new question, no axe violations`, async ({ page }, info) => {
      const posted = await mockSend(page);
      await countSentEvents(page);
      test.setTimeout(180_000);
      await openFlow(page);
      const started = Date.now();
      // Time spent in axe is not the visitor's: it is left out of the under-a-minute check.
      let axeMs = 0;
      const axe = async (state: string) => {
        const from = Date.now();
        await expectNoAxeViolations(page, `${run.intent} / ${state}`);
        axeMs += Date.now() - from;
      };

      await tabIntoFlow(page);
      await checkStepAfterFocus(page);
      await axe(contactFlow.intentQuestion);
      await page.keyboard.press(run.key);

      for (const detail of run.details) {
        await checkStep(page, detail.heading);
        await axe(detail.heading);
        await detail.act(page);
      }

      await checkStep(page, t.contactQuestion);
      await axe(t.contactQuestion);
      await page.keyboard.press("Tab");
      await expect(page.getByRole("textbox", { name: t.nameLabel })).toBeFocused();
      await page.keyboard.type("PF-019 e2e");
      await page.keyboard.press("Tab");
      await expect(page.getByRole("textbox", { name: t.emailLabel })).toBeFocused();
      await page.keyboard.type("e2e@example.com");
      await page.keyboard.press("Enter");

      await checkStep(page, t.messageQuestion);
      const message = page.getByRole("textbox", { name: t.messageLabel });
      await expect(message).not.toHaveValue("");
      await expect(message).not.toHaveValue(/[{}]/);
      await axe(t.messageQuestion);
      await page.keyboard.press("Enter");

      await checkStep(page, t.reviewQuestion);
      await expect(page.locator("#contact").getByText(t.privacy)).toBeVisible();
      await axe(t.reviewQuestion);
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press("Tab");
        if (await page.getByRole("button", { name: t.transmit }).evaluate((b) => b === document.activeElement)) break;
      }
      await expect(page.getByRole("button", { name: t.transmit })).toBeFocused();
      await page.keyboard.press("Enter");

      await expect(page.getByRole("heading", { name: t.sentHeading })).toBeFocused();
      const seconds = (Date.now() - started - axeMs) / 1000;
      info.annotations.push({ type: "duration", description: `${run.intent}: ${seconds.toFixed(1)} s` });
      console.log(`[contact timing] ${info.project.name} ${run.intent}: ${seconds.toFixed(1)} s (+ ${(axeMs / 1000).toFixed(1)} s in axe)`);
      expect(seconds).toBeLessThan(60);
      await expectNoAxeViolations(page, `${run.intent} / sent`);

      expect(posted).toHaveLength(1);
      expect(posted[0]).toContain(`name="intent"\r\n\r\n${run.intent}`);
      expect(posted[0]).toContain('name="elapsed"');
      expect(posted[0]).toContain('name="website"\r\n\r\n\r\n');
      if (run.intent === "freelance") expect(posted[0]).toContain(`name="currency"\r\n\r\nusd`);
      expect(await page.evaluate(() => (window as unknown as { __sent: unknown[] }).__sent)).toEqual([{ intent: run.intent }]);
    });
  }
});

/** The first stop: the intent group (focus is on its first option, reached by Tab). */
async function checkStepAfterFocus(page: Page) {
  const step = page.locator("#contact [data-step]:visible");
  const snapshot = await step.ariaSnapshot();
  expect(snapshot).toContain(`group "${contactFlow.intentQuestion}"`);
  for (const intent of contactFlow.intents) expect(snapshot).toContain(`radio "${intent.label}"`);
  test.info().annotations.push({ type: "a11y snapshot", description: `${contactFlow.intentQuestion}\n${snapshot}` });
}

test.describe("contact flow details", () => {
  test("no Back on the first question; Tab goes from the options to Next", async ({ page }) => {
    await openFlow(page);
    const form = page.getByRole("form", { name: t.label });
    await expect(form.getByRole("button", { name: new RegExp(t.back) })).toHaveCount(0);
    await tabIntoFlow(page);
    await page.keyboard.press("Tab");
    await expect(form.getByRole("button", { name: new RegExp(t.next) })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator(":focus")).toHaveRole("radio");
    // After the first question Back is there, between the options and Next.
    await choose(page, "Hiring for a role");
    await expect(page.getByRole("heading", { name: "Kind of role" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveRole("radio");
    await page.keyboard.press("Tab");
    await expect(form.getByRole("button", { name: new RegExp(t.back) })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(form.getByRole("button", { name: new RegExp(t.next) })).toBeFocused();
  });

  test("Back always works and answers survive a refresh", async ({ page }) => {
    await openFlow(page);
    await choose(page, "Hiring for a role");
    await expect(page.getByRole("heading", { name: "Kind of role" })).toBeFocused();
    await choose(page, "Contract");
    await expect(page.getByRole("heading", { name: "Work mode" })).toBeFocused();
    await page.reload();
    await expect(page.getByRole("button", { name: new RegExp(t.back) })).toBeEnabled();
    await expect(page.getByRole("heading", { name: "Work mode" })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(t.back) }).click();
    await expect(page.getByRole("radio", { name: "Contract", exact: true })).toBeChecked();
  });

  test("failure shows retry and the direct email link", async ({ page }) => {
    await page.route("**/api/contact", (route) =>
      route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ ok: false, error: "failed", message: "x" }) }),
    );
    await openFlow(page);
    await choose(page, "Just saying hello");
    await page.getByRole("textbox", { name: t.nameLabel }).fill("PF-019 e2e");
    await page.getByRole("textbox", { name: t.emailLabel }).fill("e2e@example.com");
    await page.getByRole("button", { name: new RegExp(t.next) }).click();
    await page.getByRole("button", { name: new RegExp(t.next) }).click();
    await page.getByRole("button", { name: t.transmit }).click();
    const alert = page.locator("#contact").getByRole("alert");
    await expect(alert).toContainText(t.failedBody);
    await expect(alert.getByRole("link")).toHaveAttribute("href", /^mailto:/);
    await expect(page.getByRole("button", { name: t.retry })).toBeEnabled();
    await expectNoAxeViolations(page, "failed send");
  });

  test("inline errors pass axe", async ({ page }) => {
    await openFlow(page);
    await page.getByRole("button", { name: new RegExp(t.next) }).click();
    await expect(page.locator("#contact").getByText(t.errorIntent)).toBeVisible();
    await expectNoAxeViolations(page, "error: no intent");
    await choose(page, "Just saying hello");
    await expect(page.getByRole("heading", { name: t.contactQuestion })).toBeFocused();
    await page.getByRole("textbox", { name: t.emailLabel }).fill("ada@");
    await page.getByRole("button", { name: new RegExp(t.next) }).click();
    await expect(page.locator("#contact").getByText(t.errorEmail)).toBeVisible();
    await expectNoAxeViolations(page, "error: name and email");
  });

  test("reduced motion: steps change without a slide", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openFlow(page);
    await choose(page, "Just saying hello");
    const step = page.locator('#contact [data-step="contact"]');
    await expect(step).toBeVisible();
    expect(await step.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  });
});

test.describe("contact form without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("every question is on one plain form, with a submit button", async ({ page }) => {
    await page.goto("/");
    const form = page.getByRole("form", { name: t.label });
    await expect(form.getByRole("group", { name: contactFlow.intentQuestion })).toBeVisible();
    for (const intent of contactFlow.intents) {
      for (const q of intent.details) await expect(form.getByRole("group", { name: q.label })).toBeVisible();
    }
    await expect(form.getByRole("textbox", { name: t.nameLabel })).toBeVisible();
    await expect(form.getByRole("textbox", { name: t.emailLabel })).toBeVisible();
    await expect(form.getByRole("textbox", { name: t.messageLabel })).toBeVisible();
    await expect(form.getByRole("button", { name: t.transmit })).toBeVisible();
    await expect(form.getByRole("button", { name: new RegExp(t.next) })).toBeHidden();
    await expect(page.getByText("Step 1 of 5")).toBeHidden();
    // ₹ / $ works with CSS alone.
    const budget = form.getByRole("group", { name: "Budget range" });
    await expect(budget.getByText("₹50k–2L")).toBeVisible();
    await budget.getByText("$ USD").click();
    await expect(budget.getByText("$600–2,400")).toBeVisible();
    await expect(budget.getByText("₹50k–2L")).toBeHidden();
  });

  // axe cannot run with JavaScript off (it needs the page's timers), so each page is scanned in a
  // copy without scripts and with the `noscript:` rules on, after proving the copy has the same
  // accessibility tree as the real JavaScript-off page (e2e/axe.ts).
  test("axe: the plain form and its result pages have no violations", async ({ page, browser }) => {
    const copy = await openWithoutScripts(browser);
    try {
      for (const [url, state] of [
        ["/", "plain form (no JavaScript)"],
        ["/contact/result/sent", "plain form result: sent"],
        ["/contact/result/failed", "plain form result: failed"],
        ["/contact/result/invalid", "plain form result: invalid"],
      ] as const) {
        await page.goto(url);
        await copy.page.goto(url);
        await expectSameAsWithoutJavaScript(copy.page, page, copy.rewrites());
        if (url === "/") {
          const form = copy.page.getByRole("form", { name: t.label });
          for (const q of contactFlow.intents.flatMap((i) => i.details)) await expect(form.getByRole("group", { name: q.label })).toBeVisible();
          await expect(form.getByRole("button", { name: t.transmit })).toBeVisible();
          await expect(form.getByRole("button", { name: new RegExp(t.next) })).toBeHidden();
        }
        await expectNoAxeViolations(copy.page, state);
      }
    } finally {
      await copy.close();
    }
  });

  async function fillPlainForm(page: Page) {
    await page.goto("/");
    const form = page.getByRole("form", { name: t.label });
    await choose(page, "Hiring for a role");
    await form.getByRole("textbox", { name: t.nameLabel }).fill("PF-019 e2e (no JS)");
    await form.getByRole("textbox", { name: t.emailLabel }).fill("e2e@example.com");
    return form;
  }

  test("submits normally and shows the server-rendered result page (send mocked)", async ({ page }) => {
    let posted = "";
    await page.route("**/api/contact", (route) => {
      posted = route.request().postData() ?? "";
      return route.fulfill({ status: 303, headers: { location: "/contact/result/sent" } });
    });
    const form = await fillPlainForm(page);
    await form.getByRole("button", { name: t.transmit }).click();
    await expect(page).toHaveURL(/\/contact\/result\/sent$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ui.contactResult.sentTitle);
    expect(posted).toContain("intent=hiring");
    expect(posted).toContain("name=PF-019+e2e+%28no+JS%29");
    expect(posted).not.toContain("elapsed=");
  });

  test("the real endpoint answers the plain form with a result page (delivery blocked in tests)", async ({ page }) => {
    const form = await fillPlainForm(page);
    await form.getByRole("button", { name: t.transmit }).click();
    // The test server cannot reach a mail service, so a valid post ends on "failed".
    await expect(page).toHaveURL(/\/contact\/result\/failed$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ui.contactResult.failedTitle);
    await expect(page.getByRole("link", { name: ui.contactResult.backToForm })).toHaveAttribute("href", "/#contact");
  });

  test("a filled trap field is refused by the real endpoint", async ({ page }) => {
    const form = await fillPlainForm(page);
    await page.locator('input[name="website"]').fill("https://spam.example", { force: true });
    await form.getByRole("button", { name: t.transmit }).click();
    await expect(page).toHaveURL(/\/contact\/result\/invalid$/);
  });
});
