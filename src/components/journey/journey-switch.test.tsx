import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The journey switch as the pages render it (D-39). next.config.ts inlines JOURNEY_LAYER at build;
// here it is stubbed. "off" (the production deployment) must render the stage 1 hero and shell
// exactly – no canvas layer, the hero opaque with its still; "on" (previews, local builds) puts the
// canvas layer in the shell and makes the hero the canvas's window.

vi.mock("@/components/journey/gate", () => ({
  JourneyLayer: () => <div data-testid="journey-layer" />,
  TierBackdrop: ({ children }: { children: ReactNode }) => <div data-testid="tier-backdrop">{children}</div>,
}));

async function load(flag: "on" | "off" | undefined) {
  vi.resetModules();
  if (flag) vi.stubEnv("JOURNEY_LAYER", flag);
  const [{ HeroSection }, { SiteShell }, { HomeSection }, { getHomeSection }] = await Promise.all([
    import("@/components/sections/hero-section"),
    import("@/components/layout/site-shell"),
    import("@/components/sections/home-section"),
    import("@/content"),
  ]);
  return { HeroSection, SiteShell, HomeSection, getHomeSection };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe.each([["off"], [undefined]] as const)("3D layer not built in (JOURNEY_LAYER=%s: production)", (flag) => {
  it("the hero is the stage 1 hero: opaque, its still in the HTML, eager and high priority", async () => {
    const { HeroSection } = await load(flag);
    const { container, queryByTestId } = render(<HeroSection />);
    const section = container.querySelector("section#top")!;
    expect(section.className).toContain("bg-background");
    expect(queryByTestId("tier-backdrop")).toBeNull();
    const img = section.querySelector("picture img")!;
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
  });

  it("the shell renders no canvas layer", async () => {
    const { SiteShell } = await load(flag);
    const { queryByTestId } = render(<SiteShell>content</SiteShell>);
    expect(queryByTestId("journey-layer")).toBeNull();
  });

  it("the other sections keep their markup (no added background)", async () => {
    const { HomeSection, getHomeSection } = await load(flag);
    const { container } = render(<HomeSection section={getHomeSection("bus")}>x</HomeSection>);
    expect(container.querySelector("section")!.getAttribute("class")).toBeNull();
  });
});

describe("3D layer built in (JOURNEY_LAYER=on: previews, local builds, dev server)", () => {
  it("the shell renders the canvas layer once, after the footer", async () => {
    const { SiteShell } = await load("on");
    const { getAllByTestId, container } = render(<SiteShell>content</SiteShell>);
    expect(getAllByTestId("journey-layer")).toHaveLength(1);
    expect(container.querySelector("footer")!.compareDocumentPosition(getAllByTestId("journey-layer")[0])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("the hero is see-through and its still goes through the tier backdrop", async () => {
    const { HeroSection } = await load("on");
    const { container, getByTestId } = render(<HeroSection />);
    const section = container.querySelector("section#top")!;
    expect(section.className).not.toContain("bg-background");
    const backdrop = getByTestId("tier-backdrop");
    expect(backdrop.parentElement).toBe(section);
    // In the static tier the still stands on the background colour, as in stage 1.
    expect(backdrop.querySelector("picture")!.parentElement!.className).toContain("bg-background");
    // The text is outside the backdrop: always in the HTML.
    expect(backdrop.textContent).toBe("");
    expect(section.querySelector("h1")).not.toBeNull();
  });

  it("the other sections are opaque, so the canvas shows through the hero only", async () => {
    const { HomeSection, getHomeSection } = await load("on");
    const { container } = render(<HomeSection section={getHomeSection("bus")}>x</HomeSection>);
    expect(container.querySelector("section")!.className).toBe("bg-background");
  });
});
