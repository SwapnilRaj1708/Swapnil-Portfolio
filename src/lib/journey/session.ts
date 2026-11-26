import { isRenderTier, type RenderTier } from "./tiers";

/**
 * What the tier system remembers for the session (this tab, until it closes): the tier floor
 * after a downgrade (the tier never climbs back within a visit), the graphics-context losses,
 * whether the frame time failed even at `low`, and the testing overrides of the visit (`?tier=`,
 * `?gpu=`, `?smooth=` – overrides.ts; never on the production deployment). sessionStorage can throw (private windows, blocked
 * site data, some in-app browsers): every access is in try/catch, and the in-memory copy still
 * applies for the current page.
 */

export const TIER_FLOOR_KEY = "journey-tier-floor";
export const CONTEXT_LOSS_KEY = "journey-context-losses";
export const LOW_FAILED_KEY = "journey-low-failed";
/** The testing overrides (`?tier=`, `?gpu=`, `?smooth=`) of this visit, as JSON (overrides.ts). */
export const OVERRIDES_KEY = "journey-overrides";

const memory: { floor: RenderTier | null; losses: number; lowFailed: boolean; overrides: string | null } = {
  floor: null,
  losses: 0,
  lowFailed: false,
  overrides: null,
};

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Not remembered across reloads; the in-memory value still applies.
  }
}

/** The lowest tier reached in this session, or null. */
export function getTierFloor(): RenderTier | null {
  const stored = read(TIER_FLOOR_KEY);
  if (isRenderTier(stored)) return stored;
  return memory.floor;
}

export function setTierFloor(tier: RenderTier): void {
  memory.floor = tier;
  write(TIER_FLOOR_KEY, tier);
}

/** Graphics-context losses counted in this session. */
export function getContextLosses(): number {
  const stored = Number.parseInt(read(CONTEXT_LOSS_KEY) ?? "", 10);
  return Number.isFinite(stored) ? Math.max(stored, memory.losses) : memory.losses;
}

/** Counts one more loss and returns the new count. */
export function addContextLoss(): number {
  const count = getContextLosses() + 1;
  memory.losses = count;
  write(CONTEXT_LOSS_KEY, String(count));
  return count;
}

/** Losses at which the session goes static for good: the first is restored, the second is not. */
export const CONTEXT_LOSSES_BEFORE_STATIC = 2;

/** The frame time failed even at `low` in this session: static for the rest of it. */
export function getLowFailed(): boolean {
  return read(LOW_FAILED_KEY) === "1" || memory.lowFailed;
}

export function setLowFailed(): void {
  memory.lowFailed = true;
  write(LOW_FAILED_KEY, "1");
}

/** The testing overrides stored for this session (JSON, validated by overrides.ts), or null. */
export function getStoredOverrides(): string | null {
  return read(OVERRIDES_KEY) ?? memory.overrides;
}

export function setStoredOverrides(value: string): void {
  memory.overrides = value;
  write(OVERRIDES_KEY, value);
}

/** For unit tests: forget the in-memory copies. */
export function resetSessionMemoryForTests(): void {
  memory.floor = null;
  memory.losses = 0;
  memory.lowFailed = false;
  memory.overrides = null;
}
