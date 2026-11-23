import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getProject, projects, ui } from "@/content";
import CaseStudyPage, { generateMetadata, generateStaticParams } from "./page";

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

async function renderCaseStudy(slug: string) {
  return render(await CaseStudyPage(params(slug)));
}

describe("/work/<slug>", () => {
  it("prerenders every project", () => {
    expect(generateStaticParams()).toEqual(projects.map((p) => ({ slug: p.slug })));
  });

  it("shows problem, role, approach, outcome, stack, links and media (Twizzr)", async () => {
    await renderCaseStudy("twizzr");
    const twizzr = getProject("twizzr")!;
    expect(screen.getByRole("heading", { level: 1, name: "Twizzr" })).toBeInTheDocument();
    expect(screen.getByText(twizzr.oneLine)).toBeInTheDocument();
    expect(screen.getByText(twizzr.role)).toBeInTheDocument();
    for (const name of ["Problem", "Approach", "Outcome"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByText(twizzr.problem)).toBeInTheDocument();
    for (const step of twizzr.approach) expect(screen.getByText(step)).toBeInTheDocument();
    for (const result of twizzr.outcome!) expect(screen.getByText(result)).toBeInTheDocument();
    const stack = screen.getByRole("list", { name: "Stack" });
    expect(within(stack).getAllByRole("listitem").map((li) => li.textContent)).toEqual(twizzr.stack);
    expect(screen.getByRole("link", { name: /^Live site/ })).toHaveAttribute("href", "https://twizzr.in");
    expect(screen.getByRole("img", { name: "Homepage of Twizzr" })).toHaveAttribute("width", "1440");
  });

  it("leaves out what the content does not have (no outcome, no image) and shows a code link when there is one", async () => {
    await renderCaseStudy("recall");
    expect(screen.queryByRole("heading", { name: "Outcome" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Code/ })).toHaveAttribute("href", "https://github.com/SwapnilRaj1708/Recall");
  });

  it("shows the readout tile as a short band in place of a screenshot, in a surface bezel", async () => {
    await renderCaseStudy("softboard-lite");
    const band = screen.getByText(ui.projects.previewBehindSignIn).closest(".min-h-readout-band");
    expect(band).not.toBeNull();
    expect(band).not.toHaveClass("aspect-screen");
    expect(band?.parentElement).toHaveClass("bg-surface");
    expect(screen.getByText("Frontend engineer")).toBeInTheDocument();
  });

  it("shows the screenshot undimmed in a 16:10 screen with a surface bezel when there is one", async () => {
    await renderCaseStudy("twizzr");
    const img = screen.getByRole("img", { name: "Homepage of Twizzr" });
    expect(img.parentElement).toHaveClass("aspect-screen");
    expect(img.parentElement!.parentElement).toHaveClass("bg-surface");
    expect(img).not.toHaveClass("screen-dim");
    expect(screen.queryByText(ui.projects.previewBehindSignIn)).not.toBeInTheDocument();
  });

  it("links back to all work and to the neighbouring projects", async () => {
    await renderCaseStudy("softboard-lite");
    expect(screen.getByRole("link", { name: /All work/ })).toHaveAttribute("href", "/work");
    const nav = screen.getByRole("navigation", { name: "Other projects" });
    expect(within(nav).getByRole("link", { name: /Twizzr/ })).toHaveAttribute("href", "/work/twizzr");
    expect(within(nav).getByRole("link", { name: /PG Gurukul/ })).toHaveAttribute("href", "/work/pg-gurukul");
  });

  it("calls notFound() (404) for an unknown slug", async () => {
    await expect(CaseStudyPage(params("no-such-project"))).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
  });

  it("takes title and description from the project", async () => {
    expect(await generateMetadata(params("creo"))).toEqual({
      title: "CREO",
      description: "A design studio's site, built to turn visitors into leads.",
    });
    expect(await generateMetadata(params("no-such-project"))).toEqual({
      title: "Page not found",
      description: "There is no page at this address.",
    });
  });
});
