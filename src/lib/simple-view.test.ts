import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadStore() {
  vi.resetModules();
  return import("./simple-view");
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("simple-view store", () => {
  it("is off by default", async () => {
    const store = await loadStore();
    expect(store.getSimpleView()).toBe(false);
  });

  it("reads a stored choice", async () => {
    window.localStorage.setItem("simple-view", "on");
    const store = await loadStore();
    expect(store.getSimpleView()).toBe(true);
  });

  it("stores the choice and notifies subscribers", async () => {
    const store = await loadStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribeSimpleView(listener);
    store.setSimpleView(true);
    expect(store.getSimpleView()).toBe(true);
    expect(window.localStorage.getItem("simple-view")).toBe("on");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.setSimpleView(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("simple-view")).toBe("off");
  });

  it("follows changes from other tabs (storage event)", async () => {
    const store = await loadStore();
    const listener = vi.fn();
    store.subscribeSimpleView(listener);
    window.dispatchEvent(new StorageEvent("storage", { key: "simple-view", newValue: "on" }));
    expect(store.getSimpleView()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("never throws when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const store = await loadStore();
    expect(store.getSimpleView()).toBe(false);
    expect(() => store.setSimpleView(true)).not.toThrow();
    expect(store.getSimpleView()).toBe(true);
  });
});
