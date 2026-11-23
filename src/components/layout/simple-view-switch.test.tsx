import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The store keeps the choice in module state; load a fresh copy for every test.
async function loadSwitch() {
  vi.resetModules();
  const { SimpleViewSwitch } = await import("./simple-view-switch");
  const store = await import("@/lib/simple-view");
  return { SimpleViewSwitch, store };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Simple view switch", () => {
  it("is a toggle button that flips aria-pressed", async () => {
    const user = userEvent.setup();
    const { SimpleViewSwitch } = await loadSwitch();
    render(<SimpleViewSwitch />);
    const button = screen.getByRole("button", { name: "Simple view" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("remembers the choice across visits", async () => {
    const user = userEvent.setup();
    const first = await loadSwitch();
    const { unmount } = render(<first.SimpleViewSwitch />);
    await user.click(screen.getByRole("button", { name: "Simple view" }));
    expect(window.localStorage.getItem(first.store.SIMPLE_VIEW_STORAGE_KEY)).toBe("on");
    unmount();

    // A new visit: fresh module state, same storage.
    const second = await loadSwitch();
    render(<second.SimpleViewSwitch />);
    expect(screen.getByRole("button", { name: "Simple view" })).toHaveAttribute("aria-pressed", "true");
  });

  it("still works when localStorage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const user = userEvent.setup();
    const { SimpleViewSwitch, store } = await loadSwitch();
    render(<SimpleViewSwitch />);
    const button = screen.getByRole("button", { name: "Simple view" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(store.getSimpleView()).toBe(true);
  });

  it("follows changes made through the store (e.g. by another switch or tab)", async () => {
    const { SimpleViewSwitch, store } = await loadSwitch();
    render(<SimpleViewSwitch />);
    act(() => store.setSimpleView(true));
    expect(screen.getByRole("button", { name: "Simple view" })).toHaveAttribute("aria-pressed", "true");
  });
});
