import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contactFlow, identity, ui } from "@/content";
import { SENT_EVENT, SESSION_KEY } from "@/lib/contact/fields";
import { Transmission } from "./transmission";

const t = ui.transmission;
/** Auto-advance pause in these tests (real timers; the site uses 1200 ms). */
const PAUSE = 300;
/** Lets real time pass inside act(), e.g. for the auto-advance pause to end. */
const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

function setup() {
  const user = userEvent.setup({ delay: null });
  const view = render(<Transmission flow={contactFlow} copy={t} ownerEmail={identity.email} autoAdvanceMs={PAUSE} />);
  return { user, ...view };
}

/** The visible step: the one frame without the `hidden` class. */
function currentFrame(container: HTMLElement) {
  return container.querySelector<HTMLElement>("[data-step]:not(.hidden)")!;
}
const live = (container: HTMLElement) => container.querySelector('[aria-live="polite"]')!.textContent;

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Transmission (contact flow)", () => {
  it("starts with the intent question: a labelled group of four options, progress shown", () => {
    const { container } = setup();
    const group = screen.getByRole("group", { name: contactFlow.intentQuestion });
    expect(within(group).getAllByRole("radio").map((r) => r.closest("label")!.textContent)).toEqual(
      contactFlow.intents.map((i, n) => `${n + 1}${i.label}`),
    );
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: t.label })).toHaveAttribute("action", "/api/contact");
    expect(currentFrame(container).dataset.step).toBe("intent");
  });

  it("a click picks, then the flow moves on by itself; focus lands on the new question", async () => {
    const { user, container } = setup();
    await user.click(screen.getByRole("radio", { name: "Hiring for a role" }));
    // Shown next to "Stay here" and read out by the live region.
    expect(screen.getAllByText(t.autoAdvance)).toHaveLength(2);
    expect(live(container)).toBe(t.autoAdvance);
    await wait(PAUSE + 100);
    expect(currentFrame(container).dataset.step).toBe("hiring.role");
    expect(screen.getByRole("heading", { name: "Kind of role" })).toHaveFocus();
    expect(live(container)).toBe("Step 2 of 5: Kind of role");
    expect(screen.getByText("Step 2 of 5 · Question 1 of 2")).toBeInTheDocument();
  });

  it("the pause can be undone: “Stay here” or Escape", async () => {
    const { user, container } = setup();
    await user.click(screen.getByRole("radio", { name: "A collaboration" }));
    await user.click(screen.getByRole("button", { name: t.autoAdvanceUndo }));
    await wait(PAUSE * 2);
    expect(currentFrame(container).dataset.step).toBe("intent");
    expect(screen.getByRole("radio", { name: "A collaboration" })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Just saying hello" }));
    await user.keyboard("{Escape}");
    await wait(PAUSE * 2);
    expect(currentFrame(container).dataset.step).toBe("intent");
  });

  it("keyboard only: number keys pick, Enter moves on, arrow keys do not auto-advance", async () => {
    const { user, container } = setup();
    await user.tab(); // the first radio of the intent group
    expect(screen.getByRole("radio", { name: "Hiring for a role" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "A freelance project" })).toBeChecked();
    await wait(PAUSE * 2);
    expect(currentFrame(container).dataset.step).toBe("intent");
    await user.keyboard("{Enter}");
    expect(currentFrame(container).dataset.step).toBe("freelance.project");
    // Number key on the next question: picks option 2 and moves on after the pause.
    await user.keyboard("2");
    expect(screen.getByRole("radio", { name: "Web app" })).toBeChecked();
    await wait(PAUSE + 100);
    expect(currentFrame(container).dataset.step).toBe("freelance.budget");
  });

  it("Next without an answer shows a specific inline error and focuses the group", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /Next/ }));
    const group = screen.getByRole("group", { name: contactFlow.intentQuestion });
    expect(group).toHaveAccessibleDescription(t.errorIntent);
    expect(screen.getByRole("radio", { name: "Hiring for a role" })).toHaveFocus();
  });

  it("freelance budget: ₹ by default, the ₹ / $ toggle switches the amounts", async () => {
    const { user, container } = setup();
    await user.click(screen.getByRole("radio", { name: "A freelance project" }));
    await wait(PAUSE + 100);
    await user.click(screen.getByRole("radio", { name: "Website" }));
    await wait(PAUSE + 100);
    const budget = screen.getByRole("group", { name: "Budget range" });
    expect(within(budget).getByRole("radio", { name: "₹ INR" })).toBeChecked();
    await user.click(within(budget).getByRole("radio", { name: "$ USD" }));
    expect(within(budget).getByRole("radio", { name: "$ USD" })).toBeChecked();
    // Both labels are in the DOM; CSS shows the one for the checked currency (globals.css).
    expect(currentFrame(container).querySelectorAll('[data-currency="usd"]')).toHaveLength(4);
  });

  it("no Back button on the first question; it appears after it and goes again on return", async () => {
    const { user } = setup();
    expect(screen.queryByRole("button", { name: /Back/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Hiring for a role" }));
    await wait(PAUSE + 100);
    expect(screen.getByRole("heading", { name: "Kind of role" })).toHaveFocus();
    const back = screen.getByRole("button", { name: /Back/ });
    expect(back).toBeEnabled();
    // Keyboard order: the question's options come before Back, Back before Next.
    const form = screen.getByRole("form", { name: t.label });
    const order = [...form.querySelectorAll<HTMLElement>("input, button")].filter((el) => !el.closest(".hidden") && el.tabIndex >= 0);
    const firstRadio = screen.getByRole("radio", { name: "Full-time" });
    expect(order.indexOf(firstRadio)).toBeLessThan(order.indexOf(back));
    expect(order.indexOf(back)).toBeLessThan(order.indexOf(screen.getByRole("button", { name: /Next/ })));
    await user.click(back);
    // Back on the first question: the button is gone and focus is on the question, not lost.
    expect(screen.queryByRole("button", { name: /Back/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: contactFlow.intentQuestion })).toHaveFocus();
  });

  it("name and email are labelled fields with inline errors; Back keeps the answers", async () => {
    const { user, container } = setup();
    await user.click(screen.getByRole("radio", { name: "Just saying hello" }));
    await wait(PAUSE + 100);
    expect(screen.getByRole("heading", { name: t.contactQuestion })).toHaveFocus();
    await user.type(screen.getByRole("textbox", { name: t.emailLabel }), "ada@");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: t.nameLabel })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: t.nameLabel })).toHaveAccessibleDescription(t.errorName);
    expect(screen.getByRole("textbox", { name: t.nameLabel })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox", { name: t.emailLabel })).toHaveAccessibleDescription(t.errorEmail);
    await user.type(screen.getByRole("textbox", { name: t.nameLabel }), "Ada");
    await user.type(screen.getByRole("textbox", { name: t.emailLabel }), "example.com");
    await user.keyboard("{Enter}");
    expect(currentFrame(container).dataset.step).toBe("message");
    expect(screen.getByRole("textbox", { name: t.messageLabel })).toHaveValue("Hi Swapnil, just saying hello.");
    await user.click(screen.getByRole("button", { name: /Back/ }));
    await user.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByRole("radio", { name: "Just saying hello" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: t.nameLabel, hidden: true })).toHaveValue("Ada");
  });

  it("restores answers and the step after a refresh (sessionStorage)", async () => {
    const first = setup();
    await first.user.click(screen.getByRole("radio", { name: "Hiring for a role" }));
    await wait(PAUSE + 100);
    await first.user.click(screen.getByRole("radio", { name: "Contract" }));
    await wait(PAUSE + 100);
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!).index).toBe(2);
    first.unmount();

    const second = setup();
    expect(currentFrame(second.container).dataset.step).toBe("hiring.work-mode");
    expect(screen.getByRole("radio", { name: "Contract", hidden: true })).toBeChecked();
  });

  it("works when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => setup()).not.toThrow();
    vi.restoreAllMocks();
  });

  async function toReview(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("radio", { name: "Just saying hello" }));
    await wait(PAUSE + 100);
    await user.type(screen.getByRole("textbox", { name: t.nameLabel }), "Ada");
    await user.type(screen.getByRole("textbox", { name: t.emailLabel }), "ada@example.com");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: /Next/ }));
  }

  it("review shows every answer and the privacy line; Transmit succeeds, emits one event, clears storage", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const sent = vi.fn();
    window.addEventListener(SENT_EVENT, sent);
    const { user, container } = setup();
    await toReview(user);
    expect(screen.getByRole("heading", { name: t.reviewQuestion })).toHaveFocus();
    const review = currentFrame(container);
    expect(within(review).getByText("Just saying hello")).toBeInTheDocument();
    expect(within(review).getByText("ada@example.com")).toBeInTheDocument();
    expect(within(review).getByText(t.privacy)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t.transmit }));
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/contact");
    const body = init.body as FormData;
    expect(body.get("intent")).toBe("hello");
    expect(body.get("website")).toBe("");
    expect(Number(body.get("elapsed"))).toBeGreaterThanOrEqual(0);
    expect(await screen.findByRole("heading", { name: t.sentHeading })).toHaveFocus();
    expect(screen.getByText(t.sentBody.replace("{email}", "ada@example.com"))).toBeInTheDocument();
    expect(sent).toHaveBeenCalledTimes(1);
    expect((sent.mock.calls[0][0] as CustomEvent).detail).toEqual({ intent: "hello" });
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    window.removeEventListener(SENT_EVENT, sent);

    // Send another: back to the start.
    await user.click(screen.getByRole("button", { name: t.sendAnother }));
    expect(screen.getByRole("heading", { name: contactFlow.intentQuestion })).toHaveFocus();
  });

  it.each([
    ["failed", 502, t.failedBody],
    ["rate-limited", 429, t.rateLimitedBody],
    ["too-fast", 400, t.tooFastBody],
  ])("%s: an alert with retry and the direct email link", async (error, status, message) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error, message: "server words" }, { status })));
    const sent = vi.fn();
    window.addEventListener(SENT_EVENT, sent);
    const { user } = setup();
    await toReview(user);
    await user.click(screen.getByRole("button", { name: t.transmit }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(within(alert).getByRole("link", { name: identity.email })).toHaveAttribute("href", expect.stringMatching(`^mailto:${identity.email}`));
    expect(screen.getByRole("button", { name: t.retry })).toBeEnabled();
    expect(sent).not.toHaveBeenCalled();
    window.removeEventListener(SENT_EVENT, sent);
  });

  it("a network failure is shown as failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    const { user } = setup();
    await toReview(user);
    await user.click(screen.getByRole("button", { name: t.transmit }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t.failedBody);
  });

  it("the trap field is hidden from assistive technology and out of the tab order", () => {
    const { container } = setup();
    const trap = container.querySelector<HTMLInputElement>('input[name="website"]')!;
    expect(trap.closest("[aria-hidden]")).toHaveAttribute("aria-hidden", "true");
    expect(trap.tabIndex).toBe(-1);
    expect(screen.queryByRole("textbox", { name: t.trapLabel })).toBeNull();
  });
});
