import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

// 10-second rule (STANDARDS.md §7): name, role and pitch are real text on the home page.
describe("home page", () => {
  it("renders the name as the only h1", () => {
    render(<Home />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Swapnil Raj");
  });

  it("renders the role and the pitch", () => {
    render(<Home />);
    expect(screen.getByText("Full-Stack Engineer")).toBeInTheDocument();
    expect(
      screen.getByText("I build fast, real-time web products that people actually use."),
    ).toBeInTheDocument();
  });

  it("puts the content inside a main landmark", () => {
    render(<Home />);
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("heading", { level: 1 }));
  });
});
