/**
 * "Simple view" choice: a tiny store with no React dependency, so the scene code (PF-007) can
 * read it outside React. The choice is remembered in localStorage; every storage access is
 * wrapped in try/catch because storage can throw (private windows, blocked site data, some
 * in-app browsers). If it throws, the choice still works for the current visit.
 */

export const SIMPLE_VIEW_STORAGE_KEY = "simple-view";

type Listener = () => void;

const listeners = new Set<Listener>();
let current: boolean | null = null;

function readStorage(): boolean {
  try {
    return window.localStorage.getItem(SIMPLE_VIEW_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function writeStorage(on: boolean): void {
  try {
    window.localStorage.setItem(SIMPLE_VIEW_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Not remembered across visits; the in-memory value still applies.
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== SIMPLE_VIEW_STORAGE_KEY) return;
  current = event.newValue === "on";
  emit();
}

/** Current choice (false on the server and before anything is stored). */
export function getSimpleView(): boolean {
  if (typeof window === "undefined") return false;
  if (current === null) current = readStorage();
  return current;
}

export function setSimpleView(on: boolean): void {
  current = on;
  writeStorage(on);
  emit();
}

/** Subscribes to changes (also from other tabs). Returns the unsubscribe function. */
export function subscribeSimpleView(listener: Listener): () => void {
  if (listeners.size === 0 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}
