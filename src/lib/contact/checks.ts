/**
 * Field rules of the contact flow, without zod – the browser bundle stays small. The endpoint
 * checks every submission again with zod (submission.ts, `fieldSchemas`), and
 * submission.test.ts proves both give the same verdict on the same inputs.
 *
 * Also the option helpers both sides need (intents, detail options, currencies).
 */
import type { ContactFlow, ContactIntent, DetailQuestion } from "@/content/schema";
import type { Currency } from "./fields";
import { LIMITS } from "./fields";

/** One-line text: no control characters (tabs, line breaks) – keeps the email subject clean. */
export const ONE_LINE = /^[^\p{Cc}]*$/u;

/**
 * The email pattern `z.email()` uses by default – copied from the installed zod 4.6.7
 * (`zod/v4/core/regexes.js`, "practical email validation"). The agreement test catches a change.
 */
export const EMAIL = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

export type TextField = "name" | "email" | "message";

/** What is wrong with a field: nothing given, too long, or not in the expected form. */
export type FieldProblem = "missing" | "too-long" | "format";

/** Checks one typed field (after trimming). Null when it is fine. */
export function checkField(field: TextField, raw: string): FieldProblem | null {
  const value = raw.trim();
  switch (field) {
    case "name":
      if (value === "") return "missing";
      if (value.length > LIMITS.name) return "too-long";
      return ONE_LINE.test(value) ? null : "format";
    case "email":
      if (value === "") return "missing";
      if (value.length > LIMITS.email) return "too-long";
      return EMAIL.test(value) ? null : "format";
    case "message":
      return value.length > LIMITS.message ? "too-long" : null;
  }
}

/** The options of a detail question; the budget's depend on the currency. */
export function optionsOf(question: DetailQuestion, currency: Currency) {
  if (question.options) return question.options;
  const set = question.currencies?.find((c) => c.id === currency) ?? question.currencies?.[0];
  return set?.options ?? [];
}

/** The currency the budget is shown in first (₹, BRIEF.md §8). */
export function defaultCurrency(flow: ContactFlow): Currency {
  for (const intent of flow.intents) {
    for (const q of intent.details) {
      const preset = q.currencies?.find((c) => c.default);
      if (preset) return preset.id;
    }
  }
  return "inr";
}

export function findIntent(flow: ContactFlow, id: string | null | undefined): ContactIntent | undefined {
  return flow.intents.find((i) => i.id === id);
}
