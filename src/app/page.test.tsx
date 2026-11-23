import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteShell } from "@/components/layout/site-shell";
import { site } from "@/content/site";
import Home from "./page";

function renderHome() {
  return render(
    <SiteShell>
      <Home />
    </SiteShell>,
  );
}

// 10-second rule (STANDARDS.md §7): name, role and pitch are real text on the home page.
describe("home page", () => {
  it("renders the name as the only h1", () => {
    renderHome();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Swapnil Raj");
  });

  it("renders the role, the pitch and the availability status", () => {
    renderHome();
    expect(screen.getByText("Full-Stack Engineer")).toBeInTheDocument();
    expect(
      screen.getByText("I build fast, real-time web products that people actually use."),
    ).toBeInTheDocument();
    expect(screen.getByText("Open to full-time roles and freelance projects")).toBeInTheDocument();
  });

  it("puts the content inside the one main landmark", () => {
    renderHome();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("heading", { level: 1 }));
  });

  it("starts with a skip link to the main content", () => {
    renderHome();
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });

  it("has a footer with the public email, GitHub, LinkedIn and the copyright", () => {
    renderHome();
    const footer = screen.getByRole("contentinfo");
    expect(footer).toContainElement(screen.getByRole("link", { name: site.email }));
    expect(screen.getByRole("link", { name: "raj.swapnil1708@gmail.com" })).toHaveAttribute(
      "href",
      "mailto:raj.swapnil1708@gmail.com",
    );
    expect(screen.getByRole("link", { name: /^GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/SwapnilRaj1708",
    );
    expect(screen.getByRole("link", { name: /^LinkedIn/ })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/swapnilraj1708",
    );
    expect(footer).toHaveTextContent("© 2026 Swapnil Raj");
  });
});
