import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ButtonLink } from "./button-link";
import { Link } from "./link";

// PF-030 follow-up 1: an anchor to the page being shown scrolls to its section and keeps the
// address's query string; everything else stays Next's.

let scrolled: Element[] = [];

beforeEach(() => {
  scrolled = [];
  // jsdom has no layout: record which element was asked to scroll into view.
  Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
    scrolled.push(this);
  });
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

function renderPage(link: React.ReactNode) {
  render(
    <>
      <nav>{link}</nav>
      <section id="about" data-testid="about" />
      <section id="contact" data-testid="contact" />
    </>,
  );
}

describe("in-page anchors on an address with a query string", () => {
  it("a click scrolls to the section, adds one history entry and keeps the query", async () => {
    window.history.replaceState(null, "", "/?utm_source=x");
    const onClick = vi.fn();
    const user = userEvent.setup();
    renderPage(
      <Link href="/#about" variant="nav" onClick={onClick}>
        About
      </Link>,
    );
    const entries = window.history.length;
    await user.click(screen.getByRole("link", { name: "About" }));
    expect(scrolled).toEqual([screen.getByTestId("about")]);
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/?utm_source=x#about");
    expect(window.history.length).toBe(entries + 1);
    // The handler passed in still runs (the phone menu closes itself).
    expect(onClick).toHaveBeenCalledTimes(1);

    // Again on the same hash: it scrolls again, without another history entry.
    await user.click(screen.getByRole("link", { name: "About" }));
    expect(scrolled).toHaveLength(2);
    expect(window.history.length).toBe(entries + 1);
  });

  it("Enter on the focused link does the same", async () => {
    window.history.replaceState(null, "", "/?trk=public_profile");
    const user = userEvent.setup();
    renderPage(
      <Link href="/#contact" variant="nav">
        Contact
      </Link>,
    );
    screen.getByRole("link", { name: "Contact" }).focus();
    await user.keyboard("{Enter}");
    expect(scrolled).toEqual([screen.getByTestId("contact")]);
    expect(window.location.search + window.location.hash).toBe("?trk=public_profile#contact");
  });

  it("works for a button-styled link too", async () => {
    window.history.replaceState(null, "", "/?utm_source=x");
    const user = userEvent.setup();
    renderPage(<ButtonLink href="/#contact">Get in touch</ButtonLink>);
    await user.click(screen.getByRole("link", { name: "Get in touch" }));
    expect(scrolled).toEqual([screen.getByTestId("contact")]);
    expect(window.location.search + window.location.hash).toBe("?utm_source=x#contact");
  });

  it("leaves a click someone else already took alone (the journey's scroll spine)", async () => {
    window.history.replaceState(null, "", "/?tier=high");
    const takeOver = (event: Event) => event.preventDefault();
    document.addEventListener("click", takeOver, { capture: true });
    try {
      const user = userEvent.setup();
      renderPage(
        <Link href="/#about" variant="nav">
          About
        </Link>,
      );
      await user.click(screen.getByRole("link", { name: "About" }));
      expect(scrolled).toEqual([]);
      expect(window.location.hash).toBe("");
    } finally {
      document.removeEventListener("click", takeOver, { capture: true });
    }
  });

  it.each([
    ["no query on the address (Next scrolls a hash-only change itself)", "/", "/#about"],
    ["a target that is not on the page", "/?utm_source=x", "/#nowhere"],
  ])("leaves the click to the router: %s", (_, address, href) => {
    window.history.replaceState(null, "", address);
    renderPage(
      <Link href={href} variant="nav">
        Go
      </Link>,
    );
    // The click reaches the handler unprevented; only the browser's default navigation is stopped
    // afterwards (on window, after React's listener), so jsdom stays on the address.
    const link = screen.getByRole("link", { name: "Go" });
    const after = (event: Event) => event.preventDefault();
    window.addEventListener("click", after);
    try {
      fireEvent.click(link);
    } finally {
      window.removeEventListener("click", after);
    }
    expect(scrolled).toEqual([]);
    expect(window.location.pathname + window.location.search).toBe(address);
  });

  it("leaves modified clicks to the browser (new tab, new window)", () => {
    window.history.replaceState(null, "", "/?utm_source=x");
    renderPage(
      <Link href="/#about" variant="nav">
        About
      </Link>,
    );
    const link = screen.getByRole("link", { name: "About" });
    // Stop the browser's default afterwards (on window, after React's listener) so jsdom stays put.
    const after = (event: Event) => event.preventDefault();
    window.addEventListener("click", after);
    try {
      for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
        fireEvent.click(link, modifier);
      }
    } finally {
      window.removeEventListener("click", after);
    }
    expect(scrolled).toEqual([]);
    expect(window.location.hash).toBe("");
  });

  it("renders the same anchor markup as before", () => {
    renderPage(
      <Link href="/#about" variant="nav" current="location">
        About
      </Link>,
    );
    const link = screen.getByRole("link", { name: "About" });
    expect(link).toHaveAttribute("href", "/#about");
    expect(link).toHaveAttribute("aria-current", "location");
  });
});
