import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { identity, ui } from "@/content";
import ContactResultPage, { generateMetadata, generateStaticParams } from "./page";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const params = (status: string) => ({ params: Promise.resolve({ status }) });
const r = ui.contactResult;

describe("/contact/result/<status> (plain form without JavaScript)", () => {
  it("prerenders the four results", () => {
    expect(generateStaticParams().map((p) => p.status)).toEqual(["sent", "invalid", "rate-limited", "failed"]);
  });

  it("sent: the confirmation as the page's one h1, a way home, no email fallback", async () => {
    render(await ContactResultPage(params("sent")));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(r.sentTitle);
    expect(screen.getByText(r.sentBody)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: r.home })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: identity.email })).toBeNull();
  });

  it.each([
    ["invalid", r.invalidTitle, r.invalidBody],
    ["rate-limited", r.rateLimitedTitle, r.rateLimitedBody],
    ["failed", r.failedTitle, r.failedBody],
  ])("%s: says why, links back to the form and offers the direct email", async (status, title, body) => {
    render(await ContactResultPage(params(status)));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(title);
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: r.backToForm })).toHaveAttribute("href", "/#contact");
    expect(screen.getByRole("link", { name: identity.email })).toHaveAttribute("href", `mailto:${identity.email}`);
  });

  it("has a title and description per result; an unknown status is a 404", async () => {
    expect(await generateMetadata(params("sent"))).toEqual({ title: r.sentTitle, description: r.sentBody });
    await expect(ContactResultPage(params("nope"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
