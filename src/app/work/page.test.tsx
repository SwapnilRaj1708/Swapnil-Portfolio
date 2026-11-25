import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projects, site, ui } from "@/content";
import WorkPage, { metadata } from "./page";

describe("/work", () => {
  it("lists all eight projects, featured first, each linking to its case study", () => {
    render(<WorkPage />);
    const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/work/"));
    expect(links.map((a) => a.textContent)).toEqual(projects.map((p) => p.name));
    expect(links).toHaveLength(8);
    expect(projects.slice(0, 5).every((p) => p.featured)).toBe(true);
    expect(projects.slice(5).map((p) => p.name)).toEqual(["LetsChat", "Windows 10 Clone", "Recall"]);
  });

  it("groups them under Featured and More projects, with the page's one h1", () => {
    render(<WorkPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const featured = screen.getByRole("region", { name: "Featured" });
    expect(within(featured).getAllByRole("article")).toHaveLength(5);
    const more = screen.getByRole("region", { name: "More projects" });
    expect(within(more).getAllByRole("article")).toHaveLength(3);
  });

  it("shows each project's role and stack", () => {
    render(<WorkPage />);
    expect(screen.getByText("Sole frontend/web engineer")).toBeInTheDocument();
    expect(screen.getAllByRole("list", { name: "Stack" })).toHaveLength(8);
  });

  it("uses images with alt text and an intrinsic size (no layout shift)", () => {
    render(<WorkPage />);
    const images = screen.getAllByRole("img");
    expect(images.length).toBe(projects.filter((p) => p.media.length > 0).length);
    for (const img of images) {
      expect(img.getAttribute("alt")).toMatch(/^Homepage of /);
      expect(img).toHaveAttribute("width");
      expect(img).toHaveAttribute("height");
      expect(img).toHaveAttribute("sizes");
    }
  });

  it("frames every screenshot dimmed at rest, lifting on hover and on focus of its card", () => {
    render(<WorkPage />);
    for (const img of screen.getAllByRole("img")) {
      expect(img).toHaveClass("screen-dim", "group-hover:filter-none", "group-focus-within:filter-none", "motion-reduce:transition-none");
      // Inside the 16:10 screen of the display frame, with the background-tone bezel.
      expect(img.parentElement).toHaveClass("aspect-screen");
      expect(img.parentElement!.parentElement).toHaveClass("bg-background");
    }
  });

  it("dims only on devices that can hover (touch screens show the screenshot at full brightness)", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const rule = css.match(/@utility screen-dim \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(rule).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{\s*filter: brightness\(var\(--screen-dim\)\);/);
    // Nothing outside that media query sets the filter.
    expect(rule.replace(/@media[^{]*\{[^}]*\}/, "")).not.toContain("filter");
  });

  it("shows a readout tile, with the sign-in label, for each project without a public preview", () => {
    render(<WorkPage />);
    const labels = screen.getAllByText(ui.projects.previewBehindSignIn);
    expect(labels).toHaveLength(projects.filter((p) => p.noPublicPreview === "behind-sign-in").length);
    for (const project of projects.filter((p) => p.media.length === 0)) {
      const card = screen.getByRole("link", { name: project.name }).closest("article")!;
      expect(within(card).queryByRole("img")).not.toBeInTheDocument();
      expect(within(card).getByText(ui.projects.previewBehindSignIn)).toBeInTheDocument();
      // The tile's copy of the name repeats the heading: hidden from assistive technology.
      const tileName = within(card).getAllByText(project.name).find((el) => el.tagName === "P")!;
      expect(tileName.closest("[aria-hidden='true']")).not.toBeNull();
      expect(tileName.closest(".aspect-screen")).not.toBeNull();
    }
  });

  it("has its own title and description from the content", () => {
    expect(metadata.title).toBe(site.meta.work.title);
    expect(metadata.description).toBe(site.meta.work.description);
    expect(metadata.alternates?.canonical).toBe("/work");
  });
});
