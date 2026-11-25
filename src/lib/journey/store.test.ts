import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addContextLoss,
  CONTEXT_LOSS_KEY,
  getContextLosses,
  getLowFailed,
  getTierFloor,
  LOW_FAILED_KEY,
  resetSessionMemoryForTests,
  setTierFloor,
  TIER_FLOOR_KEY,
} from "./session";
import {
  canvasSeen,
  changeVisibleWindows,
  enterRenderTier,
  failAtLow,
  goStatic,
  journeyStore,
  lowerTier,
  resetJourneyStoreForTests,
  setPageVisible,
  viewStore,
} from "./store";

beforeEach(() => {
  window.sessionStorage.clear();
  resetSessionMemoryForTests();
  resetJourneyStoreForTests();
  viewStore.setState({ mounted: 0, windows: 0, pageVisible: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the tier store", () => {
  it("starts pending (server render, hydration)", () => {
    expect(journeyStore.getState().tier).toBe("pending");
  });

  it("goes static with the trigger as the reason", () => {
    goStatic("reduced-motion");
    expect(journeyStore.getState()).toMatchObject({ tier: "static", reason: "reduced-motion", forced: false });
  });

  it("drops one tier at a time on measured frame time, and stops at low", () => {
    enterRenderTier("high", "capable device", false);
    expect(lowerTier()).toBe("medium");
    expect(journeyStore.getState()).toMatchObject({ tier: "medium", reason: "frame time" });
    expect(lowerTier()).toBe("low");
    expect(lowerTier()).toBe("low");
    expect(journeyStore.getState().history.map((h) => h.tier)).toEqual(["high", "medium", "low"]);
  });

  it("never climbs back within the visit: the floor is remembered for the session", () => {
    enterRenderTier("high", "capable device", false);
    lowerTier();
    expect(window.sessionStorage.getItem(TIER_FLOOR_KEY)).toBe("medium");
    // Simple view on, then off again (or a reload): the capability check says high, the floor wins.
    goStatic("simple-view");
    expect(enterRenderTier("high", "capable device", false)).toBe("medium");
    expect(journeyStore.getState().reason).toMatch(/session floor/);
  });

  it("starts below the floor when the device itself is weaker", () => {
    setTierFloor("medium");
    expect(enterRenderTier("low", "phone", false)).toBe("low");
  });

  it("a forced tier (?tier=) ignores the floor and is never lowered", () => {
    setTierFloor("low");
    expect(enterRenderTier("high", "override", true)).toBe("high");
    expect(lowerTier()).toBe("high");
    expect(journeyStore.getState()).toMatchObject({ tier: "high", forced: true });
  });

  it("does not lower the static tier or a pending one", () => {
    expect(lowerTier()).toBe("pending");
    goStatic("save-data");
    expect(lowerTier()).toBe("static");
  });
});

describe("frame time failing at low", () => {
  it("goes static for the rest of the session, with the reason in the store", () => {
    enterRenderTier("low", "phone", false);
    expect(failAtLow()).toBe("static");
    expect(journeyStore.getState()).toMatchObject({ tier: "static", reason: "low-failed", forced: false });
    expect(window.sessionStorage.getItem(LOW_FAILED_KEY)).toBe("1");
    expect(getLowFailed()).toBe(true);
    expect(journeyStore.getState().history.map((h) => `${h.tier}:${h.reason}`)).toEqual(["low:phone", "static:low-failed"]);
  });

  it("after high → medium → low on frame time", () => {
    enterRenderTier("high", "capable device", false);
    lowerTier();
    lowerTier();
    expect(failAtLow()).toBe("static");
    expect(journeyStore.getState().history.map((h) => h.tier)).toEqual(["high", "medium", "low", "static"]);
  });

  it("only from low: high and medium step down instead, static and pending stay", () => {
    enterRenderTier("high", "capable device", false);
    expect(failAtLow()).toBe("high");
    resetJourneyStoreForTests();
    expect(failAtLow()).toBe("pending");
    goStatic("save-data");
    expect(failAtLow()).toBe("static");
    expect(journeyStore.getState().reason).toBe("save-data");
    expect(getLowFailed()).toBe(false);
  });

  it("never ends a forced tier (?tier=low)", () => {
    enterRenderTier("low", "override", true);
    expect(failAtLow()).toBe("low");
    expect(journeyStore.getState()).toMatchObject({ tier: "low", forced: true });
    expect(getLowFailed()).toBe(false);
  });

  it("is remembered in memory when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    enterRenderTier("low", "phone", false);
    expect(() => failAtLow()).not.toThrow();
    expect(journeyStore.getState()).toMatchObject({ tier: "static", reason: "low-failed" });
    expect(getLowFailed()).toBe(true);
  });
});

describe("session memory with storage that throws", () => {
  it("keeps the floor and the context losses in memory for the page", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getTierFloor()).toBeNull();
    enterRenderTier("high", "capable device", false);
    expect(() => lowerTier()).not.toThrow();
    expect(getTierFloor()).toBe("medium");
    expect(enterRenderTier("high", "capable device", false)).toBe("medium");
    expect(addContextLoss()).toBe(1);
    expect(addContextLoss()).toBe(2);
    expect(getContextLosses()).toBe(2);
  });

  it("ignores a stored value that is not a tier", () => {
    window.sessionStorage.setItem(TIER_FLOOR_KEY, "ultra");
    expect(getTierFloor()).toBeNull();
    window.sessionStorage.setItem(CONTEXT_LOSS_KEY, "x");
    expect(getContextLosses()).toBe(0);
  });

  it("counts context losses across reloads of the session", () => {
    addContextLoss();
    resetSessionMemoryForTests();
    expect(getContextLosses()).toBe(1);
    expect(addContextLoss()).toBe(2);
  });
});

describe("where the canvas is seen", () => {
  it("only while the page is visible and a see-through section is in view", () => {
    expect(canvasSeen()).toBe(false);
    changeVisibleWindows(1);
    expect(canvasSeen()).toBe(true);
    setPageVisible(false);
    expect(canvasSeen()).toBe(false);
    setPageVisible(true);
    changeVisibleWindows(-1);
    expect(canvasSeen()).toBe(false);
    changeVisibleWindows(-1);
    expect(viewStore.getState().windows).toBe(0);
  });
});
