import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  journeyOverrides,
  NO_OVERRIDES,
  parseOverrides,
  parseStoredOverrides,
  resetOverridesForTests,
  resolveOverrides,
} from "./overrides";
import { OVERRIDES_KEY, resetSessionMemoryForTests } from "./session";
import { decideTier, type StaticSignals } from "./tiers";

// The testing overrides (?tier=, ?gpu=, ?smooth=) are read once per page load from the address the
// document was loaded with, and kept for the session (PF-008 follow-up: a client navigation from
// /work?tier=high to /#about used to drop them when the lazy tier loader ran after it). Never on
// the production deployment.

const HIGH_LOW_POWER = { tier: "high", gpu: "low-power", smooth: null } as const;

/** A new page load at `path` (the navigation timing entry names it), with fresh module state. */
function loadPage(path: string) {
  window.history.replaceState(null, "", path);
  const loadedWith = window.location.href;
  vi.spyOn(performance, "getEntriesByType").mockImplementation((type: string) =>
    type === "navigation" ? ([{ name: loadedWith }] as unknown as PerformanceEntryList) : [],
  );
  resetOverridesForTests();
}

/** A client navigation: the address changes, the document (and its navigation entry) stays. */
function clientNavigate(path: string) {
  window.history.pushState(null, "", path);
}

beforeEach(() => {
  window.sessionStorage.clear();
  resetSessionMemoryForTests();
  resetOverridesForTests();
  vi.stubEnv("JOURNEY_TIER_OVERRIDE", "on");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  window.history.replaceState(null, "", "/");
});

describe("parsing", () => {
  it("reads every override a query names, and null when it names none", () => {
    expect(parseOverrides("?tier=high&gpu=low-power", true)).toEqual(HIGH_LOW_POWER);
    expect(parseOverrides("?smooth=off", true)).toEqual({ tier: null, gpu: "high-performance", smooth: "off" });
    expect(parseOverrides("?tier=static", true)).toEqual({ tier: "static", gpu: "high-performance", smooth: null });
    expect(parseOverrides("", true)).toBeNull();
    expect(parseOverrides("?tier=ultra&gpu=fast&smooth=on&tune", true)).toBeNull();
  });

  it("reads nothing where the overrides are not allowed (production)", () => {
    expect(parseOverrides("?tier=high&gpu=low-power&smooth=off", false)).toBeNull();
  });

  it("validates a stored set field by field", () => {
    expect(parseStoredOverrides(JSON.stringify(HIGH_LOW_POWER))).toEqual(HIGH_LOW_POWER);
    expect(parseStoredOverrides(null)).toBeNull();
    expect(parseStoredOverrides("not json")).toBeNull();
    expect(parseStoredOverrides("[]")).toBeNull();
    expect(parseStoredOverrides(JSON.stringify({ tier: "ultra", gpu: "low-power", smooth: null }))).toBeNull();
    expect(parseStoredOverrides(JSON.stringify({ tier: "high", gpu: "fast", smooth: null }))).toBeNull();
    expect(parseStoredOverrides(JSON.stringify({ tier: "high", gpu: "low-power", smooth: "on" }))).toBeNull();
    expect(parseStoredOverrides(JSON.stringify(NO_OVERRIDES))).toBeNull();
  });
});

describe("the rule (resolveOverrides)", () => {
  const stored = JSON.stringify(HIGH_LOW_POWER);

  it("an address naming overrides wins and is stored – the whole set replaced", () => {
    expect(resolveOverrides({ documentSearch: "?tier=low", allowed: true, stored })).toEqual({
      overrides: { tier: "low", gpu: "high-performance", smooth: null },
      store: JSON.stringify({ tier: "low", gpu: "high-performance", smooth: null }),
    });
  });

  it("an address naming none keeps the stored set and stores nothing", () => {
    expect(resolveOverrides({ documentSearch: "", allowed: true, stored })).toEqual({ overrides: HIGH_LOW_POWER, store: null });
    expect(resolveOverrides({ documentSearch: "?tier=bogus", allowed: true, stored })).toEqual({ overrides: HIGH_LOW_POWER, store: null });
    expect(resolveOverrides({ documentSearch: "", allowed: true, stored: null })).toEqual({ overrides: NO_OVERRIDES, store: null });
    expect(resolveOverrides({ documentSearch: "", allowed: true, stored: "{broken" })).toEqual({ overrides: NO_OVERRIDES, store: null });
  });

  it("on production: no overrides, nothing stored, whatever the address or the storage says", () => {
    expect(resolveOverrides({ documentSearch: "?tier=high&gpu=low-power&smooth=off", allowed: false, stored })).toEqual({
      overrides: NO_OVERRIDES,
      store: null,
    });
  });
});

describe("in the browser (journeyOverrides)", () => {
  it("keeps the overrides when a client navigation replaced the address before the loader ran", () => {
    loadPage("/work?tier=high&gpu=low-power");
    // The CI failure: the header link was followed before the lazy loader read anything.
    clientNavigate("/#about");
    expect(window.location.search).toBe("");
    expect(journeyOverrides()).toEqual(HIGH_LOW_POWER);
    expect(JSON.parse(window.sessionStorage.getItem(OVERRIDES_KEY)!)).toEqual(HIGH_LOW_POWER);
    // Read once per page load: further client navigations change nothing.
    clientNavigate("/work");
    clientNavigate("/#skills");
    expect(journeyOverrides()).toEqual(HIGH_LOW_POWER);
  });

  it("keeps them for the session: a later page load without a query (a reload of /#about) still has them", () => {
    loadPage("/?tier=medium&smooth=off");
    expect(journeyOverrides()).toEqual({ tier: "medium", gpu: "high-performance", smooth: "off" });
    loadPage("/#about");
    expect(journeyOverrides()).toEqual({ tier: "medium", gpu: "high-performance", smooth: "off" });
    // A load that names overrides replaces the whole set.
    loadPage("/?tier=high");
    expect(journeyOverrides()).toEqual({ tier: "high", gpu: "high-performance", smooth: null });
    loadPage("/");
    expect(journeyOverrides()).toEqual({ tier: "high", gpu: "high-performance", smooth: null });
  });

  it("a new session (empty storage) without a query has none", () => {
    loadPage("/#about");
    expect(journeyOverrides()).toEqual(NO_OVERRIDES);
    expect(window.sessionStorage.getItem(OVERRIDES_KEY)).toBeNull();
  });

  it("falls back to the current address where the browser has no navigation timing entry", () => {
    window.history.replaceState(null, "", "/?tier=low");
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([]);
    expect(journeyOverrides()).toEqual({ tier: "low", gpu: "high-performance", smooth: null });
  });

  it("works when storage throws (kept in memory for the page)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    loadPage("/work?tier=high&gpu=low-power");
    clientNavigate("/#contact");
    expect(() => journeyOverrides()).not.toThrow();
    expect(journeyOverrides()).toEqual(HIGH_LOW_POWER);
  });

  it("is ignored on the production deployment: no override from the address, the stored set never read, nothing written", () => {
    vi.stubEnv("JOURNEY_TIER_OVERRIDE", "off");
    window.sessionStorage.setItem(OVERRIDES_KEY, JSON.stringify(HIGH_LOW_POWER));
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    loadPage("/work?tier=high&gpu=low-power&smooth=off");
    clientNavigate("/#about");
    expect(journeyOverrides()).toEqual(NO_OVERRIDES);
    loadPage("/#about");
    expect(journeyOverrides()).toEqual(NO_OVERRIDES);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("a kept forced tier still never bypasses \"no WebGL 2\"", () => {
    loadPage("/work?tier=high");
    clientNavigate("/#about");
    const staticSignals: StaticSignals = {
      simpleView: false,
      reducedMotion: false,
      saveData: false,
      contextLostTwice: false,
      chunkFailed: false,
      lowFailed: false,
    };
    const capabilities = () => ({ coarsePointer: false, screenShortSide: 900, deviceMemory: 8, hardwareConcurrency: 8 });
    const override = journeyOverrides().tier;
    expect(decideTier({ override, staticSignals, probe: () => ({ webgl2: false, softwareRenderer: false }), capabilities })).toEqual({
      tier: "static",
      reason: "no-webgl2",
      forced: false,
    });
    // …and with WebGL 2 on a software renderer (CI), the kept override gives the canvas.
    expect(decideTier({ override, staticSignals, probe: () => ({ webgl2: true, softwareRenderer: true }), capabilities })).toEqual({
      tier: "high",
      reason: "override",
      forced: true,
    });
  });
});
