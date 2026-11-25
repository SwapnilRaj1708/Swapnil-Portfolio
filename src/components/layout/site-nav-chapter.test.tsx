import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { site } from "@/content";

// PF-008: the navigation marks the chapter the visitor is in (aria-current="location"), from the
// scroll spine's chapter as chapter-bridge.ts publishes it. The hook lives in journey/gate.tsx and
// repeats the bridge's attribute and event names: publishing through the real bridge module here
// proves they agree. With the 3D layer not built in (production) nothing is ever marked.

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

async function load(flag: "on" | "off") {
  vi.resetModules();
  vi.stubEnv("JOURNEY_LAYER", flag);
  const [{ SiteNav }, bridge] = await Promise.all([import("./site-nav"), import("@/lib/journey/chapter-bridge")]);
  render(<SiteNav items={site.nav} />);
  const nav = screen.getByRole("navigation", { name: "Main" });
  const panel = document.getElementById(within(nav).getByRole("button", { name: "Menu" }).getAttribute("aria-controls")!)!;
  return { panel, publish: bridge.publishChapterSection };
}

const marked = (panel: HTMLElement) =>
  within(panel)
    .getAllByRole("link")
    .filter((a) => a.getAttribute("aria-current") === "location")
    .map((a) => a.textContent);

afterEach(() => {
  act(() => {
    document.documentElement.removeAttribute("data-journey-section");
  });
  vi.unstubAllEnvs();
  vi.resetModules();
  pathname = "/";
});

describe("navigation: current chapter (3D layer built in)", () => {
  it("marks the link of the chapter's section, and follows chapter changes", async () => {
    const { panel, publish } = await load("on");
    expect(marked(panel)).toEqual([]);
    act(() => publish("about"));
    expect(marked(panel)).toEqual(["About"]);
    const about = within(panel).getByRole("link", { name: "About" });
    // A visible mark that is not colour alone: an underline.
    expect(about.className).toContain("aria-[current=location]:underline");
    act(() => publish("skills"));
    expect(marked(panel)).toEqual(["Skills"]);
    // A chapter without a link of its own (the hero, the projects – Work opens /work) marks nothing.
    act(() => publish("top"));
    expect(marked(panel)).toEqual([]);
    act(() => publish(null));
    expect(marked(panel)).toEqual([]);
  });

  it("marks nothing on another page, whatever was published", async () => {
    pathname = "/resume";
    const { panel, publish } = await load("on");
    act(() => publish("contact"));
    expect(marked(panel)).toEqual([]);
    expect(within(panel).getByRole("link", { name: "Resume" })).toHaveAttribute("aria-current", "page");
  });
});

describe("navigation: production deployment (3D layer not built in)", () => {
  it("never marks a chapter and adds no chapter style", async () => {
    const { panel, publish } = await load("off");
    act(() => publish("about"));
    expect(marked(panel)).toEqual([]);
    expect(within(panel).getByRole("link", { name: "About" }).className).not.toContain("current=location");
  });
});
