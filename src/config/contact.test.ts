import { describe, expect, it } from "vitest";
import { CONTACT_DEFAULT_FROM, contactSender } from "./contact";

// D-36: the sender is CONTACT_EMAIL_FROM (the verified domain) when set; Resend's test sender
// otherwise. The values here are examples, not the owner's settings.
describe("contact sender", () => {
  it("uses CONTACT_EMAIL_FROM when it is set", () => {
    expect(contactSender({ CONTACT_EMAIL_FROM: "Example <hi@example.com>" })).toBe("Example <hi@example.com>");
  });

  it("trims surrounding spaces", () => {
    expect(contactSender({ CONTACT_EMAIL_FROM: "  Example <hi@example.com> " })).toBe("Example <hi@example.com>");
  });

  it.each([undefined, "", "   "])("falls back to Resend's test sender when it is %j", (value) => {
    expect(contactSender({ CONTACT_EMAIL_FROM: value })).toBe(CONTACT_DEFAULT_FROM);
  });

  it("the fallback is Resend's test sender", () => {
    expect(CONTACT_DEFAULT_FROM).toBe("Portfolio <onboarding@resend.dev>");
  });
});
