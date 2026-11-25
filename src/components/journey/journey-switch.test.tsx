import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The journey switch as the pages render it (D-39). next.config.ts inlines JOURNEY_LAYER at build;
// here it is stubbed. "off" (the production deployment) must render the stage 1 hero and shell
// exactly – no canvas layer, the hero opaque with its still; "on" (previews, local builds) puts the
// canvas layer in the shell and makes the hero the canvas's window.

// Each test re-imports the sections, the shell and the content fresh (the flag is read at import):
// under a full parallel run the first cold import can take longer than the default 5 s.
vi.setConfig({ testTimeout: 30_000 });

vi.mock("@/components/journey/gate", () => ({
  JourneyLayer: () => <div data-testid="journey-layer" />,
  TierBackdrop: ({ children }: { children: ReactNode }) => <div data-testid="tier-backdrop">{children}</div>,
  useJourneyChapter: () => null,
}));

async function load(flag: "on" | "off" | undefined) {
  vi.resetModules();
  if (flag) vi.stubEnv("JOURNEY_LAYER", flag);
  const [{ HeroSection }, { SiteShell }, { HomeSection }, { getHomeSection }, { SiteFooter }] = await Promise.all([
    import("@/components/sections/hero-section"),
    import("@/components/layout/site-shell"),
    import("@/components/sections/home-section"),
    import("@/content"),
    import("@/components/layout/site-footer"),
  ]);
  return { HeroSection, SiteShell, HomeSection, getHomeSection, SiteFooter };
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

  it("the other sections keep their stage 1 markup: the banner still in the HTML, no canvas scrim", async () => {
    const { HomeSection, getHomeSection } = await load(flag);
    const { container, queryByTestId } = render(<HomeSection section={getHomeSection("bus")}>x</HomeSection>);
    const section = container.querySelector("section")!;
    expect(section.getAttribute("class")).toBeNull();
    expect(queryByTestId("tier-backdrop")).toBeNull();
    expect(section.querySelector("picture img")!.getAttribute("loading")).toBe("lazy");
    expect(section.querySelector("[data-over-still]")!.closest("div.relative")!.className).toBe(
      "relative isolate flex aspect-banner-narrow w-full flex-col justify-end overflow-clip bg-background md:aspect-banner-wide",
    );
    expect(section.innerHTML).not.toContain("canvas:");
  });

  it("the footer keeps its stage 1 markup", async () => {
    const { SiteFooter } = await load(flag);
    const { container } = render(<SiteFooter />);
    expect(container.querySelector("footer")!.className).toBe("border-t border-line");
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

  it("the other sections are see-through too (PF-008): the banner's still goes through the tier backdrop, the text onto the canvas scrim", async () => {
    const { HomeSection, getHomeSection } = await load("on");
    const { container, getByTestId } = render(<HomeSection section={getHomeSection("bus")}>x</HomeSection>);
    const section = container.querySelector("section")!;
    expect(section.getAttribute("class")).toBeNull();
    const backdrop = getByTestId("tier-backdrop");
    expect(section.contains(backdrop)).toBe(true);
    // In the static tier the still stands on the background colour, as in stage 1; the box itself is transparent.
    expect(backdrop.querySelector("picture")!.parentElement!.className).toContain("bg-background");
    const banner = section.querySelector("[data-over-still]")!.closest("div.relative")!;
    expect(banner.className).not.toContain("bg-background");
    // The heading and the content stand on the scrim while the canvas is mounted.
    expect(section.querySelector("[data-over-still]")!.parentElement!.className).toContain("canvas:canvas-scrim");
    expect(section.querySelector(".grid")!.className).toContain("canvas:canvas-scrim");
    expect(backdrop.textContent).toBe("");
    expect(section.querySelector("h2")).not.toBeNull();
  });

  it("the footer is opaque (page chrome, like the header)", async () => {
    const { SiteFooter } = await load("on");
    const { container } = render(<SiteFooter />);
    expect(container.querySelector("footer")!.className).toContain("bg-background");
  });
});
