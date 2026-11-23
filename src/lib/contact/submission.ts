/**
 * Server-side check of a contact submission (POST /api/contact). The endpoint trusts nothing the
 * browser checked: it runs the same field rules again, here as zod schemas, and checks intents
 * and options against the content data (contact-flow.ts).
 *
 * The flow in the browser applies the same rules without zod (checks.ts) to keep its bundle
 * small; submission.test.ts proves both give the same verdict on the same inputs. Server only:
 * never import this module from a client component.
 */
import { z } from "zod";
import type { ContactFlow, ContactIntent, DetailQuestion } from "@/content/schema";
import { defaultCurrency, findIntent, ONE_LINE, optionsOf, type FieldProblem, type TextField } from "./checks";
import { CURRENCIES, type Currency, detailField, FIELD, LIMITS } from "./fields";

export const fieldSchemas = {
  name: z.string().min(1).max(LIMITS.name).regex(ONE_LINE),
  email: z.email().max(LIMITS.email),
  message: z.string().max(LIMITS.message),
} as const satisfies Record<TextField, z.ZodType>;

/** A field's problem by the zod rules (after trimming). Null when it is fine. */
export function checkFieldStrict(field: TextField, raw: string): FieldProblem | null {
  const value = raw.trim();
  const result = fieldSchemas[field].safeParse(value);
  if (result.success) return null;
  if (value === "") return "missing";
  return result.error.issues.some((i) => i.code === "too_big") ? "too-long" : "format";
}

/** A checked submission, with every choice resolved to the words the visitor saw. */
export type Submission = {
  intent: ContactIntent;
  currency: Currency;
  /** Each of the intent's questions with the picked option's label (null = not answered). */
  details: { question: DetailQuestion; answer: string | null }[];
  name: string;
  email: string;
  message: string;
};

export type SubmissionField = "intent" | "details" | TextField;

export type SubmissionResult = { ok: true; value: Submission } | { ok: false; fields: SubmissionField[] };

/**
 * Reads and checks a submission from form fields (FormData.get or a plain lookup). Details are
 * optional – the plain form without JavaScript cannot require them per intent – but a detail
 * that is given must be one of its question's options.
 */
export function readSubmission(get: (name: string) => unknown, flow: ContactFlow): SubmissionResult {
  const str = (name: string) => {
    const v = get(name);
    return typeof v === "string" ? v : "";
  };
  const fields: SubmissionField[] = [];

  const intent = findIntent(flow, str(FIELD.intent));
  if (!intent) fields.push("intent");

  const rawCurrency = str(FIELD.currency);
  const currency: Currency = (CURRENCIES as readonly string[]).includes(rawCurrency) ? (rawCurrency as Currency) : defaultCurrency(flow);

  const details: Submission["details"] = [];
  if (intent) {
    for (const question of intent.details) {
      const value = str(detailField(intent.id, question.id));
      if (value === "") {
        details.push({ question, answer: null });
        continue;
      }
      const option = optionsOf(question, currency).find((o) => o.id === value);
      if (!option) {
        if (!fields.includes("details")) fields.push("details");
        continue;
      }
      details.push({ question, answer: option.label });
    }
  }

  const name = str(FIELD.name).trim();
  const email = str(FIELD.email).trim();
  const message = str(FIELD.message).trim();
  if (checkFieldStrict("name", name)) fields.push("name");
  if (checkFieldStrict("email", email)) fields.push("email");
  if (checkFieldStrict("message", message)) fields.push("message");

  if (fields.length || !intent) return { ok: false, fields };
  return { ok: true, value: { intent, currency, details, name, email, message } };
}
