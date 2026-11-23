/**
 * Names and limits shared by the contact flow (browser) and its endpoint (server). No copy here:
 * every word the visitor sees is in src/content/data (ui.ts `transmission`, contact-flow.ts).
 */

/** Form field names. The plain form (no JavaScript) posts exactly these. */
export const FIELD = {
  intent: "intent",
  currency: "currency",
  name: "name",
  email: "email",
  message: "message",
  /** Hidden trap: people never see or fill it; a bot that fills it is rejected. */
  trap: "website",
  /** Milliseconds between the flow becoming interactive and Transmit (set by the script only). */
  elapsed: "elapsed",
} as const;

/** Field name of a detail question: "<intent id>.<question id>", e.g. "hiring.work-mode". */
export function detailField(intentId: string, questionId: string): string {
  return `${intentId}.${questionId}`;
}

export const LIMITS = { name: 100, email: 254, message: 2000 } as const;

export type Currency = "inr" | "usd";
export const CURRENCIES: readonly Currency[] = ["inr", "usd"];

/** Where the flow posts (src/app/api/contact/route.ts). */
export const CONTACT_ENDPOINT = "/api/contact";

/** The plain form's result pages: /contact/result/<status> (src/app/contact/result/[status]). */
export const RESULT_STATUSES = ["sent", "invalid", "rate-limited", "failed"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];
export function resultPath(status: ResultStatus): string {
  return `/contact/result/${status}`;
}

/** Error codes the endpoint answers with (JSON `error`). */
export type SendErrorCode = "invalid" | "too-fast" | "rate-limited" | "failed" | "forbidden";

/** sessionStorage key: answers survive Back and a refresh (cleared after a successful send). */
export const SESSION_KEY = "transmission";

/**
 * Fired once on `window` after a successful send (CustomEvent, `detail: { intent }`).
 * PF-018 uses it for the uplink spire's send pulse.
 */
export const SENT_EVENT = "transmission:sent";
