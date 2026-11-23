/**
 * In-memory sliding-window rate limit (PF-019, D-33): at most `limit` hits per key in any
 * `windowMs`. Best-effort by design – each server instance keeps its own counters and loses them
 * on a restart or cold start. Refused attempts are not counted, so waiting always helps.
 */
export type RateLimiter = {
  /** Records a hit for `key` at `now` unless the key is over the limit. */
  hit(key: string, now: number): { ok: true } | { ok: false; retryAfterMs: number };
};

export function createRateLimiter({ limit, windowMs, maxKeys = 5000 }: { limit: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const hits = new Map<string, number[]>();

  function prune(now: number) {
    for (const [key, times] of hits) {
      if (times[times.length - 1] <= now - windowMs) hits.delete(key);
    }
    // Still too many keys (a flood of different addresses): drop the oldest entries.
    while (hits.size > maxKeys) {
      const oldest = hits.keys().next().value;
      if (oldest === undefined) break;
      hits.delete(oldest);
    }
  }

  return {
    hit(key, now) {
      const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { ok: false, retryAfterMs: Math.max(0, recent[0] + windowMs - now) };
      }
      recent.push(now);
      hits.delete(key); // re-insert: Map order = least recently used first
      hits.set(key, recent);
      if (hits.size > maxKeys) prune(now);
      return { ok: true };
    },
  };
}

/**
 * The client's address as the platform reports it: Vercel sets `x-real-ip` and `x-forwarded-for`
 * itself. Elsewhere these headers can be forged – one more reason the limit is best-effort.
 */
export function clientKey(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}
