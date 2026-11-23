import { describe, expect, it } from "vitest";
import { contactFlow } from "@/content";
import { checkField, type TextField } from "./checks";
import { readSubmission, checkFieldStrict } from "./submission";

const valid = {
  intent: "freelance",
  "freelance.project": "web-app",
  "freelance.budget": "medium",
  "freelance.timeline": "asap",
  currency: "usd",
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "Hello there.",
};
const read = (fields: Record<string, string>) => readSubmission((k) => fields[k] ?? null, contactFlow);

describe("submission validation (server)", () => {
  it("accepts a valid submission and resolves the words the visitor saw", () => {
    const result = read(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent.label).toBe("A freelance project");
    expect(result.value.details.map((d) => [d.question.label, d.answer])).toEqual([
      ["Kind of project", "Web app"],
      ["Budget range", "$600–2,400"],
      ["Timeline", "ASAP"],
    ]);
  });

  it("accepts Hello with no details and no message; trims typed fields", () => {
    const result = read({ intent: "hello", name: "  Ada ", email: " ada@example.com " });
    expect(result).toMatchObject({ ok: true, value: { name: "Ada", email: "ada@example.com", message: "", details: [] } });
  });

  it("accepts missing details (the plain form cannot require them) and marks them unanswered", () => {
    const result = read({ intent: "hiring", name: "Ada", email: "ada@example.com" });
    expect(result.ok && result.value.details.every((d) => d.answer === null)).toBe(true);
  });

  it("budget defaults to ₹ when no currency is sent", () => {
    const result = read({ ...valid, currency: "" });
    expect(result.ok && result.value.details[1].answer).toBe("₹50k–2L");
  });

  it.each([
    ["missing intent", { ...valid, intent: "" }, ["intent"]],
    ["unknown intent", { ...valid, intent: "spam" }, ["intent"]],
    ["unknown option", { ...valid, "freelance.project": "rocket" }, ["details"]],
    ["missing name", { ...valid, name: " " }, ["name"]],
    ["name with a line break", { ...valid, name: "Ada\nBcc: x@y.z" }, ["name"]],
    ["name too long", { ...valid, name: "x".repeat(101) }, ["name"]],
    ["missing email", { ...valid, email: "" }, ["email"]],
    ["wrong email", { ...valid, email: "ada@" }, ["email"]],
    ["message too long", { ...valid, message: "x".repeat(2001) }, ["message"]],
    ["everything wrong", { intent: "x", name: "", email: "no" }, ["intent", "name", "email"]],
  ])("rejects %s and names the field", (_label, fields, expected) => {
    const result = read(fields as Record<string, string>);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fields).toEqual(expected);
  });
});

describe("browser checks agree with the server's zod rules", () => {
  const cases: [TextField, string][] = [
    ["name", "Ada"],
    ["name", ""],
    ["name", "   "],
    ["name", "x".repeat(100)],
    ["name", "x".repeat(101)],
    ["name", "Ada\tLovelace"],
    ["name", "Zoë O'Brien-Núñez"],
    ["email", "ada@example.com"],
    ["email", "first.last+tag@sub.example.co.uk"],
    ["email", "ada@example"],
    ["email", "ada@@example.com"],
    ["email", ".ada@example.com"],
    ["email", "ada..x@example.com"],
    ["email", "ada@-example.com"],
    ["email", "ada example@example.com"],
    ["email", ""],
    ["email", `${"a".repeat(250)}@example.com`],
    ["message", ""],
    ["message", "x".repeat(2000)],
    ["message", "x".repeat(2001)],
    ["message", "Line one\nLine two"],
  ];
  it.each(cases)("%s: %j", (field, value) => {
    expect(checkField(field, value)).toBe(checkFieldStrict(field, value));
  });
});
