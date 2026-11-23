/**
 * Step logic of the contact flow "Transmission" (BRIEF.md §6) – pure, no React, no DOM, so every
 * branch is unit-tested (flow.test.ts). The view (src/components/contact/transmission.tsx) keeps
 * a FlowState with `useReducer(createFlowReducer(flow), …)` and only adds timers, focus and I/O.
 *
 * Steps: intent → one screen per detail question of that intent (none for "Just saying hello")
 * → name and email → the pre-drafted, editable message → review. Progress is counted in stages
 * (intent, details, you, message, review: five at most, four without details) – the detail
 * screens share one stage and carry their own "question 2 of 3".
 */
import type { ContactFlow, ContactIntent, DetailQuestion } from "@/content/schema";
import { CURRENCIES, type Currency, detailField, FIELD, LIMITS, SESSION_KEY } from "./fields";
import { checkField, defaultCurrency, findIntent, optionsOf } from "./checks";

export type Answers = {
  intent: string | null;
  /** Picked option id per detail field ("hiring.role" → "full-time"); kept when the intent changes. */
  details: Record<string, string>;
  currency: Currency;
  name: string;
  email: string;
  message: string;
  /** The visitor changed the drafted message: their words are kept when the answers change. */
  messageEdited: boolean;
};

export type Stage = "intent" | "details" | "contact" | "message" | "review";

export type Step =
  | { kind: "intent"; key: "intent"; stage: "intent" }
  | {
      kind: "detail";
      /** The form field of this question, e.g. "hiring.role". */
      key: string;
      stage: "details";
      intent: ContactIntent;
      question: DetailQuestion;
      /** 1-based position among the intent's questions, and how many there are. */
      number: number;
      count: number;
    }
  | { kind: "contact"; key: "contact"; stage: "contact" }
  | { kind: "message"; key: "message"; stage: "message" }
  | { kind: "review"; key: "review"; stage: "review" };

/** Keys of ui.transmission used as inline error messages. */
export type ProblemKey = "errorIntent" | "errorPick" | "errorName" | "errorNameLong" | "errorEmail" | "errorMessageLong";

/** Inline errors by form field name ("intent", "hiring.role", "name", "email", "message"). */
export type Errors = Partial<Record<string, ProblemKey>>;

export type FlowState = {
  answers: Answers;
  index: number;
  errors: Errors;
  /** Counts navigations; the view moves focus to the new question and announces it. */
  nav: number;
  direction: "forward" | "back";
  /** Id of a waiting auto-advance (0 = none). A new pick gets a new id and restarts the pause. */
  pending: number;
  /** Source of pending ids. */
  seq: number;
  /** Counts refused "Next"s; the view moves focus to the first field with an error. */
  errorNav: number;
};

export type FlowAction =
  /** An option was picked. `auto`: picked by click, tap, Space or number key (not arrow keys). */
  | { type: "pick"; field: string; value: string; auto: boolean }
  | { type: "currency"; value: Currency }
  | { type: "text"; field: "name" | "email" | "message"; value: string }
  | { type: "next" }
  /** The auto-advance pause with this id has ended. */
  | { type: "advance"; pending: number }
  /** Cancels a waiting auto-advance ("Stay here", Escape). */
  | { type: "undo" }
  | { type: "back" }
  | { type: "restore"; answers: Answers; index: number }
  | { type: "reset" };

export function initialAnswers(flow: ContactFlow): Answers {
  return { intent: null, details: {}, currency: defaultCurrency(flow), name: "", email: "", message: "", messageEdited: false };
}

export function initialState(flow: ContactFlow): FlowState {
  return { answers: initialAnswers(flow), index: 0, errors: {}, nav: 0, direction: "forward", pending: 0, seq: 0, errorNav: 0 };
}

export function buildSteps(flow: ContactFlow, intentId: string | null): Step[] {
  const intent = findIntent(flow, intentId);
  const details: Step[] = intent
    ? intent.details.map((question, i) => ({
        kind: "detail" as const,
        key: detailField(intent.id, question.id),
        stage: "details" as const,
        intent,
        question,
        number: i + 1,
        count: intent.details.length,
      }))
    : [];
  return [
    { kind: "intent", key: "intent", stage: "intent" },
    ...details,
    { kind: "contact", key: "contact", stage: "contact" },
    { kind: "message", key: "message", stage: "message" },
    { kind: "review", key: "review", stage: "review" },
  ];
}

/** The stages shown in the progress bar. Before an intent is picked, details are assumed. */
export function stagesFor(flow: ContactFlow, intentId: string | null): Stage[] {
  const intent = findIntent(flow, intentId);
  const withDetails = !intent || intent.details.length > 0;
  return withDetails ? ["intent", "details", "contact", "message", "review"] : ["intent", "contact", "message", "review"];
}

/** "Step 2 of 5" (+ "question 1 of 3" inside the details stage). */
export function progressOf(flow: ContactFlow, state: FlowState) {
  const steps = buildSteps(flow, state.answers.intent);
  const step = steps[Math.min(state.index, steps.length - 1)];
  const stages = stagesFor(flow, state.answers.intent);
  return {
    stages,
    current: stages.indexOf(step.stage) + 1,
    total: stages.length,
    question: step.kind === "detail" ? { current: step.number, total: step.count } : null,
  };
}

export function currentStep(flow: ContactFlow, state: FlowState): Step {
  const steps = buildSteps(flow, state.answers.intent);
  return steps[Math.min(state.index, steps.length - 1)];
}

/** The label of the option picked for a detail question (null when not answered). */
export function pickedLabel(question: DetailQuestion, value: string | undefined, currency: Currency): string | null {
  if (!value) return null;
  return optionsOf(question, currency).find((o) => o.id === value)?.label ?? null;
}

/**
 * How a picked option reads inside a drafted message: its `draftLabel`, else its label with the
 * first letter lower-cased. Labels are sentence case ("Full-time" → "full-time"); amounts start
 * with a symbol or a lower-case word and stay as they are ("₹50k–2L", "under $600"). Labels that
 * start with an acronym must carry a `draftLabel` (the content schema refuses them otherwise).
 */
export function draftWording(option: { label: string; draftLabel?: string }): string {
  return option.draftLabel ?? option.label.charAt(0).toLowerCase() + option.label.slice(1);
}

/** The message drafted from the choices: the intent's `draft` with each {question} filled in. */
export function draftMessage(flow: ContactFlow, answers: Answers): string {
  const intent = findIntent(flow, answers.intent);
  if (!intent) return "";
  return intent.draft.replace(/\{([^}]*)\}/g, (_, id: string) => {
    const question = intent.details.find((q) => q.id === id);
    const value = question ? answers.details[detailField(intent.id, id)] : undefined;
    const option = question && value ? optionsOf(question, answers.currency).find((o) => o.id === value) : undefined;
    return option ? draftWording(option) : "";
  });
}

function textProblems(answers: Answers): Errors {
  const errors: Errors = {};
  const name = checkField("name", answers.name);
  if (name) errors[FIELD.name] = name === "too-long" ? "errorNameLong" : "errorName";
  if (checkField("email", answers.email)) errors[FIELD.email] = "errorEmail";
  return errors;
}

/** What stops the visitor from leaving this step (empty = nothing). */
export function stepProblems(flow: ContactFlow, step: Step, answers: Answers): Errors {
  switch (step.kind) {
    case "intent":
      return findIntent(flow, answers.intent) ? {} : { [FIELD.intent]: "errorIntent" };
    case "detail":
      return pickedLabel(step.question, answers.details[step.key], answers.currency) ? {} : { [step.key]: "errorPick" };
    case "contact":
      return textProblems(answers);
    case "message":
      return checkField("message", answers.message) ? { [FIELD.message]: "errorMessageLong" } : {};
    case "review": {
      for (const s of buildSteps(flow, answers.intent)) {
        if (s.kind === "review") break;
        const problems = stepProblems(flow, s, answers);
        if (Object.keys(problems).length) return problems;
      }
      return {};
    }
  }
}

/** Index of the first step that still has a problem (review's own index when none). */
export function firstProblemIndex(flow: ContactFlow, answers: Answers): number {
  const steps = buildSteps(flow, answers.intent);
  const i = steps.findIndex((s) => s.kind !== "review" && Object.keys(stepProblems(flow, s, answers)).length > 0);
  return i === -1 ? steps.length - 1 : i;
}

function go(flow: ContactFlow, state: FlowState, index: number, direction: FlowState["direction"]): FlowState {
  const steps = buildSteps(flow, state.answers.intent);
  const target = Math.max(0, Math.min(index, steps.length - 1));
  let answers = state.answers;
  // Entering the message: (re)draft it from the choices unless the visitor wrote their own.
  if (steps[target].kind === "message" && !answers.messageEdited) answers = { ...answers, message: draftMessage(flow, answers) };
  return { ...state, answers, index: target, errors: {}, nav: state.nav + 1, direction, pending: 0 };
}

function next(flow: ContactFlow, state: FlowState): FlowState {
  const steps = buildSteps(flow, state.answers.intent);
  const index = Math.min(state.index, steps.length - 1);
  const problems = stepProblems(flow, steps[index], state.answers);
  if (Object.keys(problems).length) return { ...state, errors: problems, errorNav: state.errorNav + 1, pending: 0 };
  if (index >= steps.length - 1) return { ...state, pending: 0 };
  return go(flow, state, index + 1, "forward");
}

function withoutError(errors: Errors, field: string): Errors {
  if (!(field in errors)) return errors;
  const rest = { ...errors };
  delete rest[field];
  return rest;
}

export function createFlowReducer(flow: ContactFlow) {
  return function reduce(state: FlowState, action: FlowAction): FlowState {
    switch (action.type) {
      case "pick": {
        const answers =
          action.field === FIELD.intent
            ? { ...state.answers, intent: action.value }
            : { ...state.answers, details: { ...state.answers.details, [action.field]: action.value } };
        const seq = state.seq + 1;
        return { ...state, answers, errors: withoutError(state.errors, action.field), seq, pending: action.auto ? seq : 0 };
      }
      case "currency":
        return { ...state, answers: { ...state.answers, currency: action.value } };
      case "text": {
        let answers = { ...state.answers, [action.field]: action.value };
        if (action.field === "message") answers = { ...answers, messageEdited: action.value !== draftMessage(flow, state.answers) };
        return { ...state, answers, errors: withoutError(state.errors, action.field) };
      }
      case "next":
        return next(flow, state);
      case "advance":
        return state.pending !== 0 && state.pending === action.pending ? next(flow, state) : state;
      case "undo":
        return state.pending ? { ...state, pending: 0 } : state;
      case "back":
        return state.index > 0 ? go(flow, state, state.index - 1, "back") : { ...state, pending: 0 };
      case "restore":
        return { ...state, answers: action.answers, index: action.index, errors: {}, pending: 0 };
      case "reset":
        return { ...initialState(flow), nav: state.nav + 1, seq: state.seq };
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Persistence: answers survive Back and a refresh (sessionStorage – this tab only, gone when it
// closes; cleared after a successful send). Every access is wrapped: storage can be missing,
// full or blocked (private modes, in-app browsers), and then the flow simply does not persist.

type Saved = { v: 1; index: number; answers: Answers };

function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveFlow(state: Pick<FlowState, "answers" | "index">, store: Storage | null = sessionStore()): void {
  try {
    const saved: Saved = { v: 1, index: state.index, answers: state.answers };
    store?.setItem(SESSION_KEY, JSON.stringify(saved));
  } catch {
    // Not persisted this time; the flow still works.
  }
}

export function clearFlow(store: Storage | null = sessionStore()): void {
  try {
    store?.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Reads saved answers back, keeping only what still matches the content (ids, lengths). */
export function loadFlow(flow: ContactFlow, store: Storage | null = sessionStore()): { answers: Answers; index: number } | null {
  let raw: string | null = null;
  try {
    raw = store?.getItem(SESSION_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || (data as Saved).v !== 1) return null;
  const saved = data as Partial<Saved>;
  const a = (saved.answers ?? {}) as Partial<Answers>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

  const answers = initialAnswers(flow);
  answers.intent = findIntent(flow, typeof a.intent === "string" ? a.intent : null)?.id ?? null;
  if (typeof a.currency === "string" && (CURRENCIES as readonly string[]).includes(a.currency)) answers.currency = a.currency;
  if (a.details && typeof a.details === "object") {
    for (const intent of flow.intents) {
      for (const question of intent.details) {
        const key = detailField(intent.id, question.id);
        const value = (a.details as Record<string, unknown>)[key];
        const known = CURRENCIES.some((c) => optionsOf(question, c).some((o) => o.id === value));
        if (typeof value === "string" && known) answers.details[key] = value;
      }
    }
  }
  answers.name = text(a.name, LIMITS.name * 2);
  answers.email = text(a.email, LIMITS.email * 2);
  answers.message = text(a.message, LIMITS.message * 2);
  answers.messageEdited = a.messageEdited === true;

  const steps = buildSteps(flow, answers.intent);
  const index = Number.isInteger(saved.index) ? Math.max(0, Math.min(saved.index as number, steps.length - 1)) : 0;
  // Never restore past a step that is no longer complete (e.g. content changed since).
  return { answers, index: Math.min(index, firstProblemIndex(flow, answers)) };
}
