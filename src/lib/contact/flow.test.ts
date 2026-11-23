import { describe, expect, it } from "vitest";
import { contactFlow } from "@/content";
import {
  buildSteps,
  createFlowReducer,
  currentStep,
  draftMessage,
  type FlowAction,
  type FlowState,
  initialState,
  loadFlow,
  progressOf,
  saveFlow,
} from "./flow";
import { SESSION_KEY } from "./fields";

const reduce = createFlowReducer(contactFlow);
const run = (actions: FlowAction[], from: FlowState = initialState(contactFlow)) => actions.reduce(reduce, from);
const pick = (field: string, value: string, auto = false): FlowAction => ({ type: "pick", field, value, auto });
const next: FlowAction = { type: "next" };
const back: FlowAction = { type: "back" };
const text = (field: "name" | "email" | "message", value: string): FlowAction => ({ type: "text", field, value });

function memoryStore(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

/** Answers every detail question of an intent with its first option, moving on each time. */
function throughDetails(intentId: string): FlowAction[] {
  const intent = contactFlow.intents.find((i) => i.id === intentId)!;
  return intent.details.flatMap((q) => {
    const first = q.options?.[0] ?? q.currencies![0].options[0];
    return [pick(`${intentId}.${q.id}`, first.id), next];
  });
}

describe("contact flow steps", () => {
  it.each([
    ["hiring", ["intent", "hiring.role", "hiring.work-mode", "contact", "message", "review"]],
    ["freelance", ["intent", "freelance.project", "freelance.budget", "freelance.timeline", "contact", "message", "review"]],
    ["collaboration", ["intent", "collaboration.kind", "contact", "message", "review"]],
    ["hello", ["intent", "contact", "message", "review"]],
  ])("%s: only the questions that fit the intent, then name/email, message and review", (intent, keys) => {
    expect(buildSteps(contactFlow, intent).map((s) => s.key)).toEqual(keys);
  });

  it("shows progress in at most five stages; Hello skips the details stage", () => {
    for (const intent of contactFlow.intents) {
      const state = run([pick("intent", intent.id)]);
      const { total, stages } = progressOf(contactFlow, state);
      expect(total).toBeLessThanOrEqual(5);
      expect(stages.includes("details")).toBe(intent.details.length > 0);
    }
    expect(progressOf(contactFlow, initialState(contactFlow))).toMatchObject({ current: 1, total: 5, question: null });
  });

  it("counts the detail questions inside the details stage", () => {
    const s = run([pick("intent", "freelance"), next, pick("freelance.project", "web-app"), next]);
    expect(currentStep(contactFlow, s).key).toBe("freelance.budget");
    expect(progressOf(contactFlow, s)).toMatchObject({ current: 2, total: 5, question: { current: 2, total: 3 } });
  });

  it.each(contactFlow.intents.map((i) => i.id))("%s: runs from intent to review", (intent) => {
    const s = run([
      pick("intent", intent),
      next,
      ...throughDetails(intent),
      text("name", "Ada Lovelace"),
      text("email", "ada@example.com"),
      next,
      next,
    ]);
    expect(currentStep(contactFlow, s).kind).toBe("review");
    expect(s.errors).toEqual({});
    expect(s.answers.message).toBe(draftMessage(contactFlow, s.answers));
    expect(s.answers.message).not.toMatch(/[{}]/);
  });

  it("refuses Next without an answer and names the problem", () => {
    let s = run([next]);
    expect(s.index).toBe(0);
    expect(s.errors).toEqual({ intent: "errorIntent" });
    expect(s.errorNav).toBe(1);
    s = run([pick("intent", "hiring"), next, next], initialState(contactFlow));
    expect(currentStep(contactFlow, s).key).toBe("hiring.role");
    expect(s.errors).toEqual({ "hiring.role": "errorPick" });
  });

  it("checks name and email on the contact step", () => {
    const toContact = [pick("intent", "hello"), next];
    expect(run([...toContact, next]).errors).toEqual({ name: "errorName", email: "errorEmail" });
    expect(run([...toContact, text("name", "x".repeat(101)), text("email", "not-an-email"), next]).errors).toEqual({
      name: "errorNameLong",
      email: "errorEmail",
    });
    expect(run([...toContact, text("name", "  "), text("email", "a@b.co"), next]).errors).toEqual({ name: "errorName" });
    const ok = run([...toContact, text("name", "Ada"), text("email", " ada@example.com "), next]);
    expect(currentStep(contactFlow, ok).kind).toBe("message");
  });

  it("clears a field's error as soon as it is answered", () => {
    const s = run([next, pick("intent", "hello")]);
    expect(s.errors).toEqual({});
  });

  it("Back always works and keeps every answer", () => {
    let s = run([pick("intent", "freelance"), next, pick("freelance.project", "website"), next, pick("freelance.budget", "medium")]);
    s = run([back, back], s);
    expect(currentStep(contactFlow, s).kind).toBe("intent");
    expect(s.direction).toBe("back");
    expect(s.answers.details).toEqual({ "freelance.project": "website", "freelance.budget": "medium" });
    s = run([next, next], s);
    expect(currentStep(contactFlow, s).key).toBe("freelance.budget");
    // Back on the first step stays there.
    expect(run([back]).index).toBe(0);
  });

  it("changing the intent after Back switches the branch and keeps the other answers", () => {
    let s = run([pick("intent", "hiring"), next, pick("hiring.role", "contract"), back, pick("intent", "hello"), next]);
    expect(currentStep(contactFlow, s).kind).toBe("contact");
    s = run([back, pick("intent", "hiring"), next], s);
    expect(s.answers.details["hiring.role"]).toBe("contract");
  });

  it("auto-advances after a single choice, and Undo (or a new pick) cancels the pending move", () => {
    const picked = run([pick("intent", "collaboration", true)]);
    expect(picked.pending).not.toBe(0);
    expect(picked.index).toBe(0);
    // The pause ends: moves on.
    const moved = run([{ type: "advance", pending: picked.pending }], picked);
    expect(currentStep(contactFlow, moved).key).toBe("collaboration.kind");
    // Undo: the pause ends but nothing moves.
    const undone = run([{ type: "undo" }], picked);
    expect(undone.pending).toBe(0);
    expect(run([{ type: "advance", pending: picked.pending }], undone).index).toBe(0);
    // A second pick restarts the pause: the first timer no longer moves anything.
    const repicked = run([pick("intent", "hello", true)], picked);
    expect(run([{ type: "advance", pending: picked.pending }], repicked).index).toBe(0);
    expect(currentStep(contactFlow, run([{ type: "advance", pending: repicked.pending }], repicked)).kind).toBe("contact");
  });

  it("does not auto-advance on arrow-key picks (auto: false)", () => {
    expect(run([pick("intent", "hiring", false)]).pending).toBe(0);
  });

  it("drafts the message from the choices; the budget in the chosen currency", () => {
    const base = run([pick("intent", "freelance"), pick("freelance.project", "web-app"), pick("freelance.budget", "medium"), pick("freelance.timeline", "asap")]);
    expect(draftMessage(contactFlow, base.answers)).toBe(
      "Hi Swapnil, I have a freelance project in mind: a web app. Budget: ₹50k–2L. Timeline: ASAP.",
    );
    const usd = run([{ type: "currency", value: "usd" }], base);
    expect(draftMessage(contactFlow, usd.answers)).toContain("Budget: $600–2,400.");
    expect(draftMessage(contactFlow, run([pick("intent", "hello")]).answers)).toBe("Hi Swapnil, just saying hello.");
  });

  it("drafts read naturally: the owner's two examples, word for word", () => {
    const hiring = run([pick("intent", "hiring"), pick("hiring.role", "full-time"), pick("hiring.work-mode", "remote")]);
    expect(draftMessage(contactFlow, hiring.answers)).toBe("Hi Swapnil, I'm hiring for a full-time role (remote) and would like to talk.");
    const freelance = run([pick("intent", "freelance"), pick("freelance.project", "website"), pick("freelance.budget", "small"), pick("freelance.timeline", "1-2-months")]);
    expect(draftMessage(contactFlow, freelance.answers)).toBe(
      "Hi Swapnil, I have a freelance project in mind: a website. Budget: under ₹50k. Timeline: 1–2 months.",
    );
  });

  /**
   * Every option of every question, as it must read inside its intent's draft (budget per
   * currency). A new option fails the coverage check until its wording is added here.
   */
  const IN_DRAFT: Record<string, string> = {
    "hiring.role/full-time": "Hi Swapnil, I'm hiring for a full-time role (remote) and would like to talk.",
    "hiring.role/contract": "Hi Swapnil, I'm hiring for a contract role (remote) and would like to talk.",
    "hiring.role/contract-to-hire": "Hi Swapnil, I'm hiring for a contract-to-hire role (remote) and would like to talk.",
    "hiring.work-mode/remote": "Hi Swapnil, I'm hiring for a full-time role (remote) and would like to talk.",
    "hiring.work-mode/hybrid": "Hi Swapnil, I'm hiring for a full-time role (hybrid) and would like to talk.",
    "hiring.work-mode/on-site": "Hi Swapnil, I'm hiring for a full-time role (on-site) and would like to talk.",
    "freelance.project/website": "Hi Swapnil, I have a freelance project in mind: a website. Budget: under ₹50k. Timeline: ASAP.",
    "freelance.project/web-app": "Hi Swapnil, I have a freelance project in mind: a web app. Budget: under ₹50k. Timeline: ASAP.",
    "freelance.project/ai-feature": "Hi Swapnil, I have a freelance project in mind: an AI feature. Budget: under ₹50k. Timeline: ASAP.",
    "freelance.project/something-else": "Hi Swapnil, I have a freelance project in mind: something else. Budget: under ₹50k. Timeline: ASAP.",
    "freelance.budget/inr/small": "Hi Swapnil, I have a freelance project in mind: a website. Budget: under ₹50k. Timeline: ASAP.",
    "freelance.budget/inr/medium": "Hi Swapnil, I have a freelance project in mind: a website. Budget: ₹50k–2L. Timeline: ASAP.",
    "freelance.budget/inr/large": "Hi Swapnil, I have a freelance project in mind: a website. Budget: ₹2L+. Timeline: ASAP.",
    "freelance.budget/inr/not-sure": "Hi Swapnil, I have a freelance project in mind: a website. Budget: not sure yet. Timeline: ASAP.",
    "freelance.budget/usd/small": "Hi Swapnil, I have a freelance project in mind: a website. Budget: under $600. Timeline: ASAP.",
    "freelance.budget/usd/medium": "Hi Swapnil, I have a freelance project in mind: a website. Budget: $600–2,400. Timeline: ASAP.",
    "freelance.budget/usd/large": "Hi Swapnil, I have a freelance project in mind: a website. Budget: $2,400+. Timeline: ASAP.",
    "freelance.budget/usd/not-sure": "Hi Swapnil, I have a freelance project in mind: a website. Budget: not sure yet. Timeline: ASAP.",
    "freelance.timeline/asap": "Hi Swapnil, I have a freelance project in mind: a website. Budget: under ₹50k. Timeline: ASAP.",
    "freelance.timeline/1-2-months": "Hi Swapnil, I have a freelance project in mind: a website. Budget: under ₹50k. Timeline: 1–2 months.",
    "freelance.timeline/flexible": "Hi Swapnil, I have a freelance project in mind: a website. Budget: under ₹50k. Timeline: flexible.",
    "collaboration.kind/open-source": "Hi Swapnil, I'd like to talk about a collaboration (open source).",
    "collaboration.kind/side-project": "Hi Swapnil, I'd like to talk about a collaboration (side project).",
    "collaboration.kind/talk-or-content": "Hi Swapnil, I'd like to talk about a collaboration (talk or content).",
    "collaboration.kind/other": "Hi Swapnil, I'd like to talk about a collaboration (other).",
  };

  /** Every (question, currency, option) of the flow; the other questions keep their first option. */
  const everyOption = contactFlow.intents.flatMap((intent) =>
    intent.details.flatMap((question) => {
      const sets = question.currencies ? question.currencies.map((c) => ({ currency: c.id, options: c.options })) : [{ currency: null, options: question.options! }];
      return sets.flatMap(({ currency, options }) =>
        options.map((option) => ({ intent, question, currency, option, key: [`${intent.id}.${question.id}`, currency, option.id].filter(Boolean).join("/") })),
      );
    }),
  );

  it("the wording table covers every option of every question (and nothing else)", () => {
    expect(everyOption.map((o) => o.key).sort()).toEqual(Object.keys(IN_DRAFT).sort());
  });

  it.each(everyOption.map((o) => [o.key, o] as const))("%s reads naturally in its draft", (key, { intent, question, currency, option }) => {
    const firsts = intent.details.map((q) => pick(`${intent.id}.${q.id}`, (q.options ?? q.currencies![0].options)[0].id));
    const actions: FlowAction[] = [pick("intent", intent.id), ...firsts, pick(`${intent.id}.${question.id}`, option.id)];
    if (currency) actions.push({ type: "currency", value: currency });
    const draft = draftMessage(contactFlow, run(actions).answers);
    expect(draft).toBe(IN_DRAFT[key]);
    expect(draft).not.toMatch(/[{}]/);
  });

  it("starts the budget in ₹ and keeps the picked tier when the currency changes", () => {
    const s = run([pick("intent", "freelance"), pick("freelance.budget", "large"), { type: "currency", value: "usd" }]);
    expect(initialState(contactFlow).answers.currency).toBe("inr");
    expect(s.answers.details["freelance.budget"]).toBe("large");
  });

  it("keeps an edited message when the answers change; redrafts an untouched one", () => {
    const toMessage = [pick("intent", "hiring"), next, pick("hiring.role", "full-time"), next, pick("hiring.work-mode", "remote"), next, text("name", "Ada"), text("email", "ada@example.com"), next];
    let s = run(toMessage);
    expect(s.answers.message).toBe("Hi Swapnil, I'm hiring for a full-time role (remote) and would like to talk.");
    // Untouched: going back and changing an answer redrafts it.
    s = run([back, back, pick("hiring.work-mode", "hybrid"), next, next], s);
    expect(s.answers.message).toContain("(hybrid)");
    // Edited: kept.
    s = run([text("message", "My own words."), back, back, pick("hiring.work-mode", "on-site"), next, next], s);
    expect(s.answers.messageEdited).toBe(true);
    expect(s.answers.message).toBe("My own words.");
  });

  it("refuses a message over 2,000 characters", () => {
    const s = run([pick("intent", "hello"), next, text("name", "Ada"), text("email", "ada@example.com"), next, text("message", "x".repeat(2001)), next]);
    expect(currentStep(contactFlow, s).kind).toBe("message");
    expect(s.errors).toEqual({ message: "errorMessageLong" });
  });

  it("reset starts again from the intent", () => {
    const s = run([pick("intent", "hello"), next, text("name", "Ada"), { type: "reset" }]);
    expect(s.index).toBe(0);
    expect(s.answers.intent).toBeNull();
    expect(s.answers.name).toBe("");
  });
});

describe("contact flow persistence", () => {
  it("restores answers and the step after a refresh", () => {
    const store = memoryStore();
    const s = run([pick("intent", "hiring"), next, pick("hiring.role", "contract"), next, pick("hiring.work-mode", "remote"), next, text("name", "Ada"), text("email", "ada@example.com")]);
    saveFlow(s, store);
    const restored = loadFlow(contactFlow, store);
    expect(restored).toEqual({ answers: s.answers, index: s.index });
    const again = run([{ type: "restore", ...restored! }]);
    expect(currentStep(contactFlow, again).kind).toBe("contact");
  });

  it("drops unknown ids and never restores past an unanswered step", () => {
    const store = memoryStore();
    store.setItem(
      SESSION_KEY,
      JSON.stringify({ v: 1, index: 5, answers: { intent: "hiring", details: { "hiring.role": "astronaut", "nope.x": "y" }, currency: "eur", name: 42 } }),
    );
    const restored = loadFlow(contactFlow, store)!;
    expect(restored.answers.details).toEqual({});
    expect(restored.answers.currency).toBe("inr");
    expect(restored.answers.name).toBe("");
    expect(buildSteps(contactFlow, "hiring")[restored.index].key).toBe("hiring.role");
  });

  it("survives broken, missing and throwing storage", () => {
    const store = memoryStore();
    store.setItem(SESSION_KEY, "{not json");
    expect(loadFlow(contactFlow, store)).toBeNull();
    expect(loadFlow(contactFlow, memoryStore())).toBeNull();
    expect(loadFlow(contactFlow, null)).toBeNull();
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    } as unknown as Storage;
    expect(loadFlow(contactFlow, throwing)).toBeNull();
    expect(() => saveFlow(initialState(contactFlow), throwing)).not.toThrow();
  });
});
