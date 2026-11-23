import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { site } from "@/content/site";
import { SiteNav } from "./site-nav";

const EXPECTED = [
  ["Work", "/work"],
  ["About", "/#about"],
  ["Experience", "/#experience"],
  ["Skills", "/#skills"],
  ["Contact", "/#contact"],
  ["Resume", "/resume"],
] as const;

function renderNav() {
  render(<SiteNav items={site.nav} />);
  const nav = screen.getByRole("navigation", { name: "Main" });
  const menuButton = within(nav).getByRole("button", { name: "Menu" });
  return { nav, menuButton };
}

describe("site navigation", () => {
  it("has all six links, in order, with the right targets", () => {
    const { nav } = renderNav();
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual(EXPECTED);
  });

  it("contains the Simple view switch", () => {
    const { nav } = renderNav();
    expect(within(nav).getByRole("button", { name: "Simple view" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("mobile menu", () => {
  it("is a disclosure button that controls the link panel", async () => {
    const user = userEvent.setup();
    const { menuButton } = renderNav();
    const panelId = menuButton.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).toContainElement(screen.getByRole("link", { name: "Work" }));

    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await user.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await user.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape and returns focus to the button", async () => {
    const user = userEvent.setup();
    const { menuButton } = renderNav();
    await user.click(menuButton);
    await user.tab(); // into the panel
    expect(screen.getByRole("link", { name: "Work" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(menuButton).toHaveFocus();
  });

  it("closes when a link is chosen", async () => {
    const user = userEvent.setup();
    const { menuButton } = renderNav();
    await user.click(menuButton);
    await user.click(screen.getByRole("link", { name: "About" }));
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
  });

  it("ignores Escape while closed", async () => {
    const user = userEvent.setup();
    const { menuButton } = renderNav();
    await user.keyboard("{Escape}");
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(menuButton).not.toHaveFocus();
  });
});
