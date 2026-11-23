import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteShell } from "@/components/layout/site-shell";
import { featuredProjects, homeSections, identity, services, site } from "@/content";
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
    expect(screen.getByText("I build fast, real-time web products that people actually use.")).toBeInTheDocument();
    expect(screen.getAllByText("Open to full-time roles and freelance projects").length).toBeGreaterThanOrEqual(1);
  });

  it("has the chapter sections in the owner's order with the BRIEF §3 ids (D-24)", () => {
    const { container } = renderHome();
    const ids = [...container.querySelectorAll("main section[data-chapter]")].map((s) => s.id);
    expect(ids).toEqual(["top", "about", "experience", "work", "skills", "contact"]);
    expect(homeSections.map((s) => s.sectionId)).toEqual(ids);
  });

  it("shows the about beats, every role and every skill group", () => {
    renderHome();
    expect(screen.getByText(/I like the problems underneath the UI/)).toBeInTheDocument();
    for (const title of ["Software Development Engineer 2", "Software Development Engineer 1", "Software Development Intern"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    for (const group of ["Frontend", "Backend", "AI", "Tools"]) {
      expect(screen.getByRole("heading", { name: group })).toBeInTheDocument();
    }
  });

  it("lists the five featured projects in order, each linking to its case study", () => {
    const { container } = renderHome();
    const work = within(container.querySelector("section#work") as HTMLElement);
    const links = work.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/work/"));
    expect(links.map((a) => a.textContent)).toEqual(featuredProjects.map((p) => p.name));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(featuredProjects.map((p) => `/work/${p.slug}`));
    expect(featuredProjects.map((p) => p.name)).toEqual([
      "Twizzr",
      "Softboard Lite",
      "PG Gurukul",
      "CREO",
      "EngineerHUB website",
    ]);
  });

  it("shows the services and a direct email link in the contact section", () => {
    const { container } = renderHome();
    const contact = within(container.querySelector("section#contact") as HTMLElement);
    for (const s of services) expect(contact.getByRole("heading", { name: s.title })).toBeInTheDocument();
    expect(contact.getByRole("link", { name: identity.email })).toHaveAttribute("href", `mailto:${identity.email}`);
  });

  it("has the contact flow in the contact section: a real form that posts to /api/contact (PF-019)", () => {
    const { container } = renderHome();
    const contact = within(container.querySelector("section#contact") as HTMLElement);
    const form = contact.getByRole("form", { name: "Transmission" });
    expect(form).toHaveAttribute("action", "/api/contact");
    expect(form).toHaveAttribute("method", "post");
    expect(contact.getByRole("group", { name: "What brings you here?" })).toBeInTheDocument();
  });

  it("links Work and Resume from the hero (one action away)", () => {
    const { container } = renderHome();
    const hero = within(container.querySelector("section#top") as HTMLElement);
    expect(hero.getByRole("link", { name: "See the work" })).toHaveAttribute("href", "/work");
    expect(hero.getByRole("link", { name: "Resume" })).toHaveAttribute("href", "/resume");
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
    const footer = within(screen.getByRole("contentinfo"));
    expect(footer.getByRole("link", { name: "raj.swapnil1708@gmail.com" })).toHaveAttribute(
      "href",
      "mailto:raj.swapnil1708@gmail.com",
    );
    expect(footer.getByRole("link", { name: /^GitHub/ })).toHaveAttribute("href", "https://github.com/SwapnilRaj1708");
    expect(footer.getByRole("link", { name: /^LinkedIn/ })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/swapnilraj1708",
    );
    expect(screen.getByRole("contentinfo")).toHaveTextContent(site.copyright);
  });
});
