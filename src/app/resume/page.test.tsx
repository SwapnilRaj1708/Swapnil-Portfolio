import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { site } from "@/content";
import ResumePage, { metadata } from "./page";

describe("/resume", () => {
  it("shows experience, education and skills", () => {
    render(<ResumePage />);
    const experience = screen.getByRole("region", { name: "Experience" });
    expect(within(experience).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Software Development Engineer 2",
      "Software Development Engineer 1",
      "Software Development Intern",
    ]);
    expect(within(experience).getByText("Cut merchant onboarding time by 40%")).toBeInTheDocument();
    const education = screen.getByRole("region", { name: "Education" });
    expect(within(education).getByText("B.Tech, Computer Science and Engineering")).toBeInTheDocument();
    expect(within(education).getByText(/Ajay Kumar Garg Engineering College/)).toBeInTheDocument();
    const skills = screen.getByRole("region", { name: "Skills" });
    expect(within(skills).getByText("TanStack Query")).toBeInTheDocument();
  });

  it("shows dates as machine-readable <time> elements", () => {
    const { container } = render(<ResumePage />);
    const times = [...container.querySelectorAll("time")].map((t) => `${t.getAttribute("datetime")}=${t.textContent}`);
    expect(times).toContain("2025-04=Apr 2025");
    expect(times).toContain("2020-10=Oct 2020");
    expect(screen.getAllByText(/Present/).length).toBeGreaterThan(0);
  });

  it("offers the PDF as a download", () => {
    render(<ResumePage />);
    const link = screen.getByRole("link", { name: /Download the PDF/ });
    expect(link).toHaveAttribute("href", "/resume/swapnil-raj-resume.pdf");
    expect(link).toHaveAttribute("download", "swapnil-raj-resume.pdf");
  });

  it("has its own title and description from the content", () => {
    expect(metadata.title).toBe(site.meta.resume.title);
    expect(metadata.description).toBe(site.meta.resume.description);
  });
});
