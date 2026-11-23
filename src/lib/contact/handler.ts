/**
 * The contact endpoint's logic (POST /api/contact, PF-019), separate from the route file so it is
 * tested with a mocked mail client (handler.test.ts).
 *
 * Order: same-origin check → rate limit → body size → trap field → minimum time → validation (the
 * same rules as the flow, again) → send. Nothing is stored. Every refusal carries a safe, fixed
 * message from the content; provider details and the key never leave the server.
 *
 * Two kinds of caller:
 *  - the flow's script (`Accept: application/json`): JSON `{ ok: true }` or
 *    `{ ok: false, error, message, fields? }` with a matching status;
 *  - the plain form without JavaScript: a 303 redirect to a result page, /contact/result/<status>.
 */
import type { Ui } from "@/content/data/ui";
import type { ContactFlow } from "@/content/schema";
import { buildEmail, type OutgoingMail } from "./email";
import { FIELD, resultPath, type ResultStatus, type SendErrorCode } from "./fields";
import { clientKey, type RateLimiter } from "./rate-limit";
import { readSubmission, type SubmissionField } from "./submission";

export type MailClient = {
  send(mail: OutgoingMail & { from: string; to: string }): Promise<{ ok: true; id: string } | { ok: false; reason: string }>;
};

export type ContactDeps = {
  flow: ContactFlow;
  copy: { transmission: Ui["transmission"]; email: Ui["transmissionEmail"] };
  recipient: string;
  from: string;
  /** null when no API key is configured: nothing can be sent (503). */
  mail: MailClient | null;
  limiter: RateLimiter;
  minElapsedMs: number;
  maxBodyBytes: number;
  timeZone: string;
  now?: () => number;
  log?: { info(message: string): void; error(message: string): void };
};

export type ContactResponseBody =
  | { ok: true }
  | { ok: false; error: SendErrorCode; message: string; fields?: SubmissionField[] };

const STATUS: Record<SendErrorCode, number> = {
  invalid: 422,
  "too-fast": 400,
  "rate-limited": 429,
  failed: 502,
  forbidden: 403,
};

const RESULT_PAGE: Record<SendErrorCode, ResultStatus> = {
  invalid: "invalid",
  "too-fast": "invalid",
  "rate-limited": "rate-limited",
  failed: "failed",
  forbidden: "invalid",
};

function sameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return true; // not a browser cross-site post; other checks still apply
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function handleContact(request: Request, deps: ContactDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? console;
  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");
  const t = deps.copy.transmission;
  const messages: Record<SendErrorCode, string> = {
    invalid: t.invalidBody,
    "too-fast": t.tooFastBody,
    "rate-limited": t.rateLimitedBody,
    failed: t.failedBody,
    forbidden: t.invalidBody,
  };

  function refuse(error: SendErrorCode, extra: { status?: number; fields?: SubmissionField[]; retryAfterS?: number } = {}): Response {
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (extra.retryAfterS !== undefined) headers["Retry-After"] = String(extra.retryAfterS);
    if (!wantsJson) return new Response(null, { status: 303, headers: { ...headers, Location: resultPath(RESULT_PAGE[error]) } });
    const body: ContactResponseBody = { ok: false, error, message: messages[error], ...(extra.fields ? { fields: extra.fields } : {}) };
    return Response.json(body, { status: extra.status ?? STATUS[error], headers });
  }

  if (!sameOrigin(request.headers)) return refuse("forbidden");

  const limit = deps.limiter.hit(clientKey(request.headers), now());
  if (!limit.ok) return refuse("rate-limited", { retryAfterS: Math.ceil(limit.retryAfterMs / 1000) });

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > deps.maxBodyBytes) return refuse("invalid", { status: 413 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return refuse("invalid", { status: 400 });
  }

  // Trap: a hidden field people never fill.
  const trap = form.get(FIELD.trap);
  if (typeof trap === "string" && trap.trim() !== "") return refuse("invalid", { status: 400 });

  // Minimum time: the flow's script reports how long the visitor spent. The plain form (no
  // JavaScript) cannot measure it and sends no value – the trap and the rate limit cover it.
  const elapsed = form.get(FIELD.elapsed);
  if (elapsed !== null) {
    const ms = Number(elapsed);
    if (!Number.isFinite(ms) || ms < deps.minElapsedMs) return refuse("too-fast");
  }

  const result = readSubmission((name) => form.get(name), deps.flow);
  if (!result.ok) return refuse("invalid", { fields: result.fields });

  if (!deps.mail) {
    log.error("contact: not sent – RESEND_API_KEY is not set");
    return refuse("failed", { status: 503 });
  }

  const email = buildEmail(result.value, deps.copy.email, new Date(now()), deps.timeZone);
  const sent = await deps.mail.send({ ...email, from: deps.from, to: deps.recipient });
  if (!sent.ok) {
    log.error(`contact: not sent – mail service error: ${sent.reason}`);
    return refuse("failed");
  }

  log.info(`contact: sent, message id ${sent.id}`);
  if (!wantsJson) return new Response(null, { status: 303, headers: { "Cache-Control": "no-store", Location: resultPath("sent") } });
  const body: ContactResponseBody = { ok: true };
  return Response.json(body, { status: 200, headers: { "Cache-Control": "no-store" } });
}
