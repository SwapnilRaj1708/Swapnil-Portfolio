import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_SERVER } from "next/constants";
import { afterEach, describe, expect, it, vi } from "vitest";

// The journey switch (D-39, src/config/journey.ts): the 3D layer is built in when the build is not
// the Vercel production deployment, or when JOURNEY_LAUNCHED is true. Like launch-switch.test.ts,
// the rule is tested for every combination and the real module under a stubbed VERCEL_ENV.

/** The real module, imported fresh under a given VERCEL_ENV. */
async function realJourney(vercelEnv: string | undefined) {
  vi.resetModules();
  vi.stubEnv("VERCEL_ENV", vercelEnv);
  return import("./journey");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const ENVS = ["production", "preview", "development", undefined, ""] as const;

describe("the journey rule", () => {
  it.each([
    ...ENVS.map((env) => [true, env, true] as const),
    [false, "production", false],
    [false, "preview", true],
    [false, "development", true],
    [false, undefined, true],
    [false, "", true],
  ] as const)("launched %s, VERCEL_ENV %s → 3D layer %s", async (launched, env, expected) => {
    const { isJourneyEnabled } = await realJourney(undefined);
    expect(isJourneyEnabled(launched, env)).toBe(expected);
  });

  it("is not launched yet (PF-026 flips it)", async () => {
    const { JOURNEY_LAUNCHED } = await realJourney(undefined);
    expect(JOURNEY_LAUNCHED).toBe(false);
  });

  it("keeps the 3D layer off on the Vercel production deployment", async () => {
    const { JOURNEY_ENABLED } = await realJourney("production");
    expect(JOURNEY_ENABLED).toBe(false);
  });

  it.each(["preview", "development", undefined])("builds the 3D layer in for VERCEL_ENV=%s (previews, local builds)", async (env) => {
    const { JOURNEY_ENABLED } = await realJourney(env);
    expect(JOURNEY_ENABLED).toBe(true);
  });
});

describe("the production deployment", () => {
  it.each(ENVS)("means the same as in the launch switch (VERCEL_ENV=%s)", async (env) => {
    const [{ isTierOverrideAllowed }, { isProductionDeployment }] = await Promise.all([realJourney(undefined), import("./site")]);
    expect(isTierOverrideAllowed(env)).toBe(!isProductionDeployment(env));
  });
});

describe("the ?tier= override", () => {
  it.each([
    ["production", false],
    ["preview", true],
    ["development", true],
    [undefined, true],
  ] as const)("VERCEL_ENV %s → allowed %s", async (env, expected) => {
    const { isTierOverrideAllowed } = await realJourney(undefined);
    expect(isTierOverrideAllowed(env)).toBe(expected);
  });
});

describe("the dev tools (leva, r3f-perf)", () => {
  it.each([
    [true, undefined, true],
    [true, "1", true],
    [false, "1", true],
    [false, undefined, false],
    [false, "0", false],
    [false, "", false],
  ] as const)("dev server %s, ENABLE_DEV_PAGES %s → %s", async (devServer, flag, expected) => {
    const { isJourneyDevTools } = await realJourney(undefined);
    expect(isJourneyDevTools(devServer, flag)).toBe(expected);
  });
});

describe("the flags next.config.ts inlines", () => {
  it("production deployment before the stage 2 launch: everything off", async () => {
    const { journeyBuildEnv } = await realJourney(undefined);
    expect(journeyBuildEnv({ launched: false, vercelEnv: "production", devServer: false, enableDevPages: "1" })).toEqual({
      JOURNEY_LAYER: "off",
      JOURNEY_TIER_OVERRIDE: "off",
      JOURNEY_DEV_TOOLS: "off",
    });
  });

  it("production deployment after the launch: the layer, but no override and no dev tools", async () => {
    const { journeyBuildEnv } = await realJourney(undefined);
    expect(journeyBuildEnv({ launched: true, vercelEnv: "production", devServer: false, enableDevPages: undefined })).toEqual({
      JOURNEY_LAYER: "on",
      JOURNEY_TIER_OVERRIDE: "off",
      JOURNEY_DEV_TOOLS: "off",
    });
  });

  it("a preview: the layer and the override, no dev tools", async () => {
    const { journeyBuildEnv } = await realJourney(undefined);
    expect(journeyBuildEnv({ launched: false, vercelEnv: "preview", devServer: false, enableDevPages: undefined })).toEqual({
      JOURNEY_LAYER: "on",
      JOURNEY_TIER_OVERRIDE: "on",
      JOURNEY_DEV_TOOLS: "off",
    });
  });

  it("the dev server and ENABLE_DEV_PAGES=1 builds: everything on", async () => {
    const { journeyBuildEnv } = await realJourney(undefined);
    for (const options of [
      { launched: false, vercelEnv: undefined, devServer: true, enableDevPages: undefined },
      { launched: false, vercelEnv: undefined, devServer: false, enableDevPages: "1" },
    ]) {
      expect(journeyBuildEnv(options)).toEqual({ JOURNEY_LAYER: "on", JOURNEY_TIER_OVERRIDE: "on", JOURNEY_DEV_TOOLS: "on" });
    }
  });

  it("is what next.config.ts passes as `env`, for the build's own environment", async () => {
    vi.resetModules();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ENABLE_DEV_PAGES", "1");
    const { default: config } = await import("../../next.config");
    expect(config(PHASE_PRODUCTION_SERVER).env).toEqual({ JOURNEY_LAYER: "off", JOURNEY_TIER_OVERRIDE: "off", JOURNEY_DEV_TOOLS: "off" });

    vi.resetModules();
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("ENABLE_DEV_PAGES", "");
    const { default: previewConfig } = await import("../../next.config");
    expect(previewConfig(PHASE_PRODUCTION_SERVER).env).toEqual({ JOURNEY_LAYER: "on", JOURNEY_TIER_OVERRIDE: "on", JOURNEY_DEV_TOOLS: "off" });
    expect(previewConfig(PHASE_DEVELOPMENT_SERVER).env?.JOURNEY_DEV_TOOLS).toBe("on");
  });
});
