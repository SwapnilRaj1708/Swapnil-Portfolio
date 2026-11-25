import { PHASE_PRODUCTION_SERVER } from "next/constants";
import { afterEach, describe, expect, it, vi } from "vitest";

// The launch switch (src/config/site.ts): public = SITE_LAUNCHED and the Vercel production
// deployment (VERCEL_ENV === "production"). Public or not drives three things – robots metadata,
// the X-Robots-Tag header, robots.txt – plus the sitemap line. These tests replace the module
// with each state, so the real switch is never edited; the real module is tested with the
// environment stubbed.

const SITE_URL = "https://swapnilraj.in";

async function withState(isPublic: boolean) {
  vi.resetModules();
  vi.doMock("@/config/site", () => ({
    SITE_LAUNCHED: true,
    SITE_PUBLIC: isPublic,
    IS_PRODUCTION_DEPLOYMENT: isPublic,
    SITE_URL,
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

/** The real module, imported fresh under a given VERCEL_ENV. */
async function realSite(vercelEnv: string | undefined) {
  vi.resetModules();
  vi.stubEnv("VERCEL_ENV", vercelEnv);
  return import("./site");
}

afterEach(() => {
  vi.doUnmock("@/config/site");
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("next.config: production builds", () => {
  it("never reuse Turbopack's build cache (a restored .next/cache shipped stale CSS on Vercel, PF-028)", async () => {
    const { nextConfig } = await withState(false);
    expect(nextConfig.experimental?.turbopackFileSystemCacheForBuild).toBe(false);
  });
});

describe("the launch rule", () => {
  it.each([
    [true, "production", true],
    [true, "preview", false],
    [true, "development", false],
    [true, undefined, false],
    [true, "", false],
    [false, "production", false],
    [false, "preview", false],
    [false, undefined, false],
  ] as const)("launched %s, VERCEL_ENV %s → public %s", async (launched, env, expected) => {
    const { isSitePublic } = await realSite(undefined);
    expect(isSitePublic(launched, env)).toBe(expected);
  });

  it("is switched on (stage 1 launch, PF-029)", async () => {
    const { SITE_LAUNCHED } = await realSite(undefined);
    expect(SITE_LAUNCHED).toBe(true);
  });

  it("makes the Vercel production deployment public", async () => {
    const site = await realSite("production");
    expect(site.SITE_PUBLIC).toBe(true);
    expect(site.IS_PRODUCTION_DEPLOYMENT).toBe(true);
  });

  it.each(["preview", "development", undefined])("keeps VERCEL_ENV=%s (previews, local builds) not public", async (env) => {
    const site = await realSite(env);
    expect(site.SITE_PUBLIC).toBe(false);
    expect(site.IS_PRODUCTION_DEPLOYMENT).toBe(false);
  });

  it("uses the site's address without a trailing slash", async () => {
    const site = await realSite(undefined);
    expect(site.SITE_URL).toBe(SITE_URL);
  });
});

describe("not public (preview, local build)", () => {
  it("sets robots metadata to noindex, nofollow", async () => {
    const { metadata } = await withState(false);
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("disallows everything in robots.txt and names no sitemap", async () => {
    const { robots } = await withState(false);
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("sends X-Robots-Tag: noindex, nofollow on every path", async () => {
    const { nextConfig } = await withState(false);
    expect(await nextConfig.headers?.()).toEqual([
      { source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ]);
  });

  it("still sets the site's address as metadataBase (canonical and social URLs)", async () => {
    const { metadata } = await withState(false);
    expect(metadata.metadataBase?.toString()).toBe(`${SITE_URL}/`);
  });
});

describe("public (the Vercel production deployment)", () => {
  it("sets no robots metadata", async () => {
    const { metadata } = await withState(true);
    expect(metadata.robots).toBeUndefined();
  });

  it("allows everything in robots.txt and names the sitemap", async () => {
    const { robots } = await withState(true);
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" }, sitemap: `${SITE_URL}/sitemap.xml` });
  });

  it("sends no X-Robots-Tag header", async () => {
    const { nextConfig } = await withState(true);
    expect(await nextConfig.headers?.()).toEqual([]);
  });

  it("sets the site's address as metadataBase", async () => {
    const { metadata } = await withState(true);
    expect(metadata.metadataBase?.toString()).toBe(`${SITE_URL}/`);
  });
});

describe("the sitemap", () => {
  it("lists the home page, /work, every case study in display order and /resume – nothing else", async () => {
    const [{ default: sitemap }, { projects }] = await Promise.all([import("@/app/sitemap"), import("@/content")]);
    expect(sitemap().map((e) => e.url)).toEqual([
      SITE_URL,
      `${SITE_URL}/work`,
      ...projects.map((p) => `${SITE_URL}/work/${p.slug}`),
      `${SITE_URL}/resume`,
    ]);
    expect(projects.length).toBe(8);
  });
});
