import {
  CONTACT_MAX_BODY_BYTES,
  CONTACT_MIN_ELAPSED_MS,
  CONTACT_RATE_LIMIT,
  CONTACT_SEND_TIMEOUT_MS,
  CONTACT_TIME_ZONE,
  contactSender,
} from "@/config/contact";
import { contactFlow, identity, ui } from "@/content";
import { handleContact } from "@/lib/contact/handler";
import { createRateLimiter } from "@/lib/contact/rate-limit";
import { createResendMailer } from "@/lib/contact/resend-mailer";

/**
 * POST /api/contact – delivery of the contact flow "Transmission" (PF-019). Logic and checks:
 * src/lib/contact/handler.ts. The rate limiter lives in this module, so it counts per server
 * instance (best-effort, D-33).
 */
const limiter = createRateLimiter(CONTACT_RATE_LIMIT);

export async function POST(request: Request): Promise<Response> {
  return handleContact(request, {
    flow: contactFlow,
    copy: { transmission: ui.transmission, email: ui.transmissionEmail },
    recipient: identity.email,
    from: contactSender(process.env),
    mail: createResendMailer(process.env.RESEND_API_KEY, CONTACT_SEND_TIMEOUT_MS),
    limiter,
    minElapsedMs: CONTACT_MIN_ELAPSED_MS,
    maxBodyBytes: CONTACT_MAX_BODY_BYTES,
    timeZone: CONTACT_TIME_ZONE,
  });
}
