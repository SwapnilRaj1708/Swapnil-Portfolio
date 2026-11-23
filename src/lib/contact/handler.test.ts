import { describe, expect, it, vi } from "vitest";
import { contactFlow, ui } from "@/content";
import { buildEmail } from "./email";
import { type ContactDeps, type ContactResponseBody, handleContact, type MailClient } from "./handler";
import { clientKey, createRateLimiter } from "./rate-limit";
import { readSubmission } from "./submission";

const NOW = Date.UTC(2026, 10, 23, 14, 30);

function deps(overrides: Partial<ContactDeps> = {}) {
  const send = vi.fn<MailClient["send"]>(async () => ({ ok: true as const, id: "msg_test_1" }));
  const log = { info: vi.fn(), error: vi.fn() };
  const d: ContactDeps = {
    flow: contactFlow,
    copy: { transmission: ui.transmission, email: ui.transmissionEmail },
    recipient: "owner@example.com",
    from: "Portfolio <onboarding@resend.dev>",
    mail: { send },
    limiter: createRateLimiter({ limit: 5, windowMs: 600_000 }),
    minElapsedMs: 3000,
    maxBodyBytes: 32 * 1024,
    timeZone: "Asia/Kolkata",
    now: () => NOW,
    log,
    ...overrides,
  };
  return { d, send, log };
}

const VALID: Record<string, string> = {
  intent: "hiring",
  "hiring.role": "full-time",
  "hiring.work-mode": "remote",
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "Hi Swapnil, I'm hiring.",
  website: "",
  elapsed: "15000",
};

function post(fields: Record<string, string>, { json = true, headers = {} as Record<string, string> } = {}) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request("http://localhost:3000/api/contact", {
    method: "POST",
    body,
    headers: { host: "localhost:3000", origin: "http://localhost:3000", "x-real-ip": "203.0.113.7", ...(json ? { accept: "application/json" } : {}), ...headers },
  });
}

async function json(res: Response) {
  return (await res.json()) as ContactResponseBody;
}

describe("POST /api/contact (mail client mocked)", () => {
  it("sends a valid submission: 200, one email to the owner with reply-to the visitor", async () => {
    const { d, send, log } = deps();
    const res = await handleContact(post(VALID), d);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0];
    expect(mail).toMatchObject({ to: "owner@example.com", from: "Portfolio <onboarding@resend.dev>", replyTo: "ada@example.com" });
    expect(mail.subject).toBe("[Portfolio] Hiring for a role – Ada Lovelace");
    expect(mail.text).toContain("Kind of role: Full-time");
    expect(mail.text).toContain("Work mode: Remote");
    expect(mail.text).toContain("Hi Swapnil, I'm hiring.");
    expect(mail.html).toContain("Ada Lovelace");
    expect(log.info).toHaveBeenCalledWith("contact: sent, message id msg_test_1");
  });

  it("provider error: 502 with a safe message, no provider details", async () => {
    const { d, log } = deps({ mail: { send: async () => ({ ok: false, reason: "invalid_api_key (status 401) secret-ish detail" }) } });
    const res = await handleContact(post(VALID), d);
    expect(res.status).toBe(502);
    const body = await json(res);
    expect(body).toEqual({ ok: false, error: "failed", message: ui.transmission.failedBody });
    expect(JSON.stringify(body)).not.toMatch(/invalid_api_key|401|secret/);
    expect(log.error).toHaveBeenCalledOnce();
  });

  it("no API key configured: 503, nothing sent", async () => {
    const { d } = deps({ mail: null });
    const res = await handleContact(post(VALID), d);
    expect(res.status).toBe(503);
    expect(await json(res)).toMatchObject({ ok: false, error: "failed" });
  });

  it("trap filled: 400, nothing sent", async () => {
    const { d, send } = deps();
    const res = await handleContact(post({ ...VALID, website: "https://spam.example" }), d);
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "invalid", message: ui.transmission.invalidBody });
    expect(send).not.toHaveBeenCalled();
  });

  it("too fast (under 3 s, or a non-number): 400, nothing sent", async () => {
    for (const elapsed of ["1200", "abc", ""]) {
      const { d, send } = deps();
      const res = await handleContact(post({ ...VALID, elapsed }), d);
      expect(res.status, elapsed).toBe(400);
      expect(await json(res)).toEqual({ ok: false, error: "too-fast", message: ui.transmission.tooFastBody });
      expect(send).not.toHaveBeenCalled();
    }
  });

  it("rate-limited: the sixth request from one address in 10 minutes gets 429 with Retry-After", async () => {
    const { d, send } = deps();
    for (let i = 0; i < 5; i++) expect((await handleContact(post(VALID), d)).status).toBe(200);
    const res = await handleContact(post(VALID), d);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await json(res)).toEqual({ ok: false, error: "rate-limited", message: ui.transmission.rateLimitedBody });
    expect(send).toHaveBeenCalledTimes(5);
    // Another address is not affected.
    expect((await handleContact(post(VALID, { headers: { "x-real-ip": "198.51.100.1" } }), d)).status).toBe(200);
  });

  it("invalid payload: 422 naming the fields, nothing sent", async () => {
    const { d, send } = deps();
    const res = await handleContact(post({ ...VALID, intent: "spam", email: "nope" }), d);
    expect(res.status).toBe(422);
    expect(await json(res)).toEqual({ ok: false, error: "invalid", message: ui.transmission.invalidBody, fields: ["intent", "email"] });
    expect(send).not.toHaveBeenCalled();
  });

  it("a body that is not a form: 400", async () => {
    const { d } = deps();
    const req = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json", accept: "application/json" },
    });
    expect((await handleContact(req, d)).status).toBe(400);
  });

  it("an oversized body: 413", async () => {
    const { d, send } = deps();
    const res = await handleContact(post(VALID, { headers: { "content-length": String(64 * 1024) } }), d);
    expect(res.status).toBe(413);
    expect(send).not.toHaveBeenCalled();
  });

  it("a post from another site: 403", async () => {
    const { d, send } = deps();
    const res = await handleContact(post(VALID, { headers: { origin: "https://evil.example" } }), d);
    expect(res.status).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });

  describe("plain form without JavaScript (no JSON accept): 303 to a result page", () => {
    it.each([
      ["sent", VALID, "/contact/result/sent"],
      ["no timer value: the plain form cannot measure time", { ...VALID, elapsed: undefined }, "/contact/result/sent"],
      ["trap", { ...VALID, website: "x" }, "/contact/result/invalid"],
      ["invalid", { ...VALID, email: "" }, "/contact/result/invalid"],
    ])("%s", async (_label, fields, location) => {
      const { d } = deps();
      const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as Record<string, string>;
      const res = await handleContact(post(clean, { json: false }), d);
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(location);
    });

    it("failed send → /contact/result/failed; rate-limited → /contact/result/rate-limited", async () => {
      const failing = deps({ mail: { send: async () => ({ ok: false, reason: "x" }) } }).d;
      expect((await handleContact(post(VALID, { json: false }), failing)).headers.get("location")).toBe("/contact/result/failed");
      const { d } = deps({ limiter: createRateLimiter({ limit: 0, windowMs: 1000 }) });
      expect((await handleContact(post(VALID, { json: false }), d)).headers.get("location")).toBe("/contact/result/rate-limited");
    });
  });
});

describe("the email", () => {
  it("escapes everything the visitor typed in the HTML version", () => {
    const result = readSubmission(
      (k) => ({ ...VALID, name: "<b>Ada</b>", message: '<script>alert("x")</script>\nline 2' })[k] ?? null,
      contactFlow,
    );
    if (!result.ok) throw new Error("expected valid");
    const mail = buildEmail(result.value, ui.transmissionEmail, new Date(NOW), "Asia/Kolkata");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("&lt;b&gt;Ada&lt;/b&gt;");
    expect(mail.text).toContain('<script>alert("x")</script>\nline 2');
    expect(mail.text).toContain("Sent: 23 Nov 2026, 20:00 GMT+5:30 (2026-11-23T14:30:00.000Z)");
  });

  it("shortens a very long name in the subject and marks unanswered details", () => {
    const result = readSubmission((k) => ({ intent: "freelance", name: "N".repeat(100), email: "a@b.co" })[k] ?? null, contactFlow);
    if (!result.ok) throw new Error("expected valid");
    const mail = buildEmail(result.value, ui.transmissionEmail, new Date(NOW), "Asia/Kolkata");
    expect(mail.subject.length).toBeLessThan(110);
    expect(mail.text).toContain("Budget range: not answered");
    expect(mail.text).toContain("Message:\n(no message)");
  });
});

describe("rate limiter", () => {
  it("is a sliding window and does not count refused attempts", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(limiter.hit("a", 0).ok).toBe(true);
    expect(limiter.hit("a", 100).ok).toBe(true);
    expect(limiter.hit("a", 200)).toEqual({ ok: false, retryAfterMs: 800 });
    expect(limiter.hit("a", 900).ok).toBe(false);
    expect(limiter.hit("a", 1001).ok).toBe(true); // the first hit left the window
  });

  it("keeps a bounded number of keys", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 3 });
    for (const k of ["a", "b", "c", "d"]) limiter.hit(k, 0);
    expect(limiter.hit("a", 1).ok).toBe(true); // "a" was dropped as the oldest
  });

  it("reads the client address from the platform headers", () => {
    expect(clientKey(new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" }))).toBe("203.0.113.7");
    expect(clientKey(new Headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }))).toBe("198.51.100.2");
    expect(clientKey(new Headers())).toBe("unknown");
  });
});
