/**
 * Contact delivery settings (PF-019, owner decision D-33). Server side only.
 *
 * Environment (names in .env.example; values only in .env.local and in Vercel, never in the repo):
 *   RESEND_API_KEY      required to send; without it the endpoint answers 503 and nothing is sent
 *   CONTACT_EMAIL_FROM  optional sender, e.g. "Portfolio <hello@swapnilraj.in>" once the domain is
 *                       verified with Resend; default: Resend's test sender below, which can only
 *                       deliver to the Resend account owner's own address (the recipient here)
 *
 * The recipient is the public email in the content (src/content/data/identity.ts).
 */
export const CONTACT_DEFAULT_FROM = "Portfolio <onboarding@resend.dev>";

/**
 * Built-in rate limit, per server instance and best-effort: 5 submissions per client IP in any
 * 10 minutes. Counters live in memory, so each serverless instance counts on its own and a cold
 * start forgets them. If spam ever gets through, a shared store (Upstash Redis) is the next step –
 * a new account, so an owner decision (D-33).
 */
export const CONTACT_RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 } as const;

/** A submission sent sooner than this after the flow became interactive is treated as a bot. */
export const CONTACT_MIN_ELAPSED_MS = 3000;

/** Largest request body accepted (a full submission is about 3 KB). */
export const CONTACT_MAX_BODY_BYTES = 32 * 1024;

/** How long the endpoint waits for the mail service before answering "failed". */
export const CONTACT_SEND_TIMEOUT_MS = 10_000;

/** Time zone of the "Sent" line in the email: the owner's (IST, BRIEF.md §8). */
export const CONTACT_TIME_ZONE = "Asia/Kolkata";
