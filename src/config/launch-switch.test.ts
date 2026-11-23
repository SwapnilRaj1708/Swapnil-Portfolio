import { PHASE_PRODUCTION_SERVER } from "next/constants";
import { afterEach, describe, expect, it, vi } from "vitest";

// The launch switch (src/config/site.ts) drives three things. These tests replace the
// module with each value of SITE_LAUNCHED, so the real switch is never edited.

async function withSwitch(launched: boolean) {
  vi.resetModules();
  vi.doMock("@/config/site", () => ({
    SITE_LAUNCHED: launched,
    NOINDEX_DIRECTIVE: "noindex, nofollow",
  }));
  const [{ metadata }, { default: robots }, { default: config }] = await Promise.all([
    import("@/app/layout"),
    import("@/app/robots"),
    import("../../next.config"),
  ]);
  // next.config exports a function of the phase; the server phase skips the build-time file check.
  return { metadata, robots, nextConfig: config(PHASE_PRODUCTION_SERVER) };
}

afterEach(() => {
  vi.doUnmock("@/config/site");
  vi.resetModules();
});

describe("launch switch: not launched (SITE_LAUNCHED = false)", () => {
  it("sets robots metadata to noindex, nofollow", async () => {
    const { metadata } = await withSwitch(false);
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("disallows everything in robots.txt", async () => {
    const { robots } = await withSwitch(false);
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  it("sends X-Robots-Tag: noindex, nofollow on every path", async () => {
    const { nextConfig } = await withSwitch(false);
    expect(await nextConfig.headers?.()).toEqual([
      { source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ]);
  });
});

describe("launch switch: launched (SITE_LAUNCHED = true)", () => {
  it("sets no robots metadata", async () => {
    const { metadata } = await withSwitch(true);
    expect(metadata.robots).toBeUndefined();
  });

  it("allows everything in robots.txt", async () => {
    const { robots } = await withSwitch(true);
    expect(robots().rules).toEqual({ userAgent: "*", allow: "/" });
  });

  it("sends no X-Robots-Tag header", async () => {
    const { nextConfig } = await withSwitch(true);
    expect(await nextConfig.headers?.()).toEqual([]);
  });
});
