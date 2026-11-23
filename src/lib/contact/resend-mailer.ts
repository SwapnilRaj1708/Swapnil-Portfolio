/**
 * Mail delivery through Resend (D-18, D-33) – the only module that touches the mail service.
 * The API key is read by the route (process.env.RESEND_API_KEY) and passed in; it is never logged,
 * returned or put in an error. Errors come back as a short reason for the server log only.
 */
import { Resend } from "resend";
import type { MailClient } from "./handler";

export function createResendMailer(apiKey: string | undefined, timeoutMs: number): MailClient | null {
  if (!apiKey) return null;
  const resend = new Resend(apiKey);
  return {
    async send(mail) {
      try {
        const { data, error } = await resend.emails.send(
          { from: mail.from, to: mail.to, replyTo: mail.replyTo, subject: mail.subject, text: mail.text, html: mail.html },
          { signal: AbortSignal.timeout(timeoutMs) },
        );
        if (error || !data) return { ok: false, reason: `${error?.name ?? "no data"} (status ${error?.statusCode ?? "none"})` };
        return { ok: true, id: data.id };
      } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.name : "unknown error" };
      }
    },
  };
}
