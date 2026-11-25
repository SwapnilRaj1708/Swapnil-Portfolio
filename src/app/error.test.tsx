import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { errorCopy } from "@/content/data/error-copy";
import ErrorPage from "./error";
import GlobalError from "./global-error";

// A thrown error with a message and stack that must never reach the visitor.
function secretError() {
  const error = new Error("database password is hunter2");
  error.stack = "Error: database password is hunter2\n    at secretFunction (/srv/app/secret.ts:12:3)";
  return Object.assign(error, { digest: "digest-abcdef" });
}

describe("error page (error.tsx)", () => {
  it("shows the heading, the line and the ways out – never the error's message or stack", () => {
    const { container } = render(<ErrorPage error={secretError()} retry={() => {}} />);
    expect(screen.getByRole("heading", { level: 1, name: errorCopy.heading })).toBeInTheDocument();
    expect(screen.getByText(errorCopy.body)).toBeInTheDocument();
    for (const [name, href] of [
      [errorCopy.home, "/"],
      [errorCopy.work, "/work"],
      [errorCopy.resume, "/resume"],
    ]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(container.textContent).not.toMatch(/hunter2|secretFunction|secret\.ts|digest-abcdef/);
  });

  it("Try again calls Next's retry", async () => {
    const retry = vi.fn();
    render(<ErrorPage error={secretError()} retry={retry} />);
    await userEvent.click(screen.getByRole("button", { name: errorCopy.retry }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("global error page (global-error.tsx)", () => {
  const html = renderToStaticMarkup(<GlobalError error={secretError()} retry={() => {}} />);

  it("is a whole document in the site's language with a title and one main landmark", () => {
    expect(html).toMatch(/^<html lang="en"/);
    expect(html).toContain(`<title>${errorCopy.heading}</title>`);
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Something went wrong<\/h1>/);
  });

  it("uses plain links (a full page load) and a Try again button", () => {
    for (const href of ["/", "/work", "/resume"]) expect(html).toContain(`href="${href}"`);
    expect(html).toContain(`>${errorCopy.retry}</button>`);
  });

  it("never shows the error's message, stack or digest", () => {
    expect(html).not.toMatch(/hunter2|secretFunction|secret\.ts|digest-abcdef/);
  });
});
