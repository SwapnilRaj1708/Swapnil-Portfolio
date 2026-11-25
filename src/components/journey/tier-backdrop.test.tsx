import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enterRenderTier, goStatic, resetJourneyStoreForTests, viewStore } from "@/lib/journey/store";
import { TierBackdrop } from "./tier-backdrop";

// The hero's backdrop with the 3D layer built in: the still is in the DOM only in the static tier;
// before the tier is known and on every render tier it is inside <noscript> (never fetched with
// JavaScript on). Its section counts as a canvas window while it intersects the viewport.

type Callback = (entries: { isIntersecting: boolean }[]) => void;
let observers: { callback: Callback; disconnect: ReturnType<typeof vi.fn> }[] = [];

beforeEach(() => {
  resetJourneyStoreForTests();
  viewStore.setState({ mounted: 0, windows: 0, pageVisible: true });
  observers = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      disconnect = vi.fn();
      constructor(callback: Callback) {
        observers.push({ callback, disconnect: this.disconnect });
      }
      observe() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderBackdrop() {
  return render(
    <section data-testid="hero">
      <TierBackdrop>
        <span data-testid="still">the still</span>
      </TierBackdrop>
    </section>,
  );
}

describe("TierBackdrop", () => {
  it("keeps the still out of the DOM while the tier is pending", () => {
    const { container, queryByTestId } = renderBackdrop();
    expect(queryByTestId("still")).toBeNull();
    expect(container.querySelector("noscript")).not.toBeNull();
    expect(container.querySelector("[data-tier-backdrop]")?.getAttribute("data-tier-backdrop")).toBe("pending");
  });

  it("keeps it out on a render tier (the canvas shows through instead)", () => {
    act(() => {
      enterRenderTier("high", "capable device", false);
    });
    const { queryByTestId } = renderBackdrop();
    expect(queryByTestId("still")).toBeNull();
  });

  it("draws it in the static tier – also when the tier turns static later", () => {
    const { queryByTestId, container } = renderBackdrop();
    act(() => {
      goStatic("chunk-failed");
    });
    expect(queryByTestId("still")).not.toBeNull();
    expect(container.querySelector("noscript")).toBeNull();
  });

  it("counts its section as a canvas window while it is in view", () => {
    const { unmount } = renderBackdrop();
    expect(viewStore.getState().mounted).toBe(1);
    expect(observers).toHaveLength(1);
    act(() => observers[0].callback([{ isIntersecting: true }]));
    expect(viewStore.getState().windows).toBe(1);
    act(() => observers[0].callback([{ isIntersecting: true }]));
    expect(viewStore.getState().windows).toBe(1);
    act(() => observers[0].callback([{ isIntersecting: false }]));
    expect(viewStore.getState().windows).toBe(0);
    act(() => observers[0].callback([{ isIntersecting: true }]));
    unmount();
    expect(viewStore.getState().windows).toBe(0);
    expect(viewStore.getState().mounted).toBe(0);
    expect(observers[0].disconnect).toHaveBeenCalled();
  });
});
