/**
 * Journey switch (D-39): the 3D layer stays off on the live site until the stage 2 launch.
 *
 * The 3D layer (the persistent canvas, its loader and the lazy 3D chunk) is built in when EITHER
 *   - the build is not the Vercel production deployment (previews, local builds, the dev server), or
 *   - `JOURNEY_LAUNCHED` is `true` (PF-026 flips it at the stage 2 launch).
 * On the production deployment before that, swapnilraj.in keeps the stage 1 home exactly: the
 * loader is not in any bundle, nothing is rendered for it and no 3D chunk exists to be requested.
 *
 * The decision is made at build time. next.config.ts passes it to the code as the inlined
 * `process.env.JOURNEY_LAYER` ("on" | "off", `journeyBuildEnv` below); the modules that import the
 * 3D layer test that value in place, so the bundler drops the import entirely when it is "off".
 */
export const JOURNEY_LAUNCHED = false;

/**
 * The Vercel production deployment (not previews, not local builds) – the same test as
 * `isProductionDeployment` in site.ts (journey.test.ts checks they agree). Kept here so this switch
 * does not depend on the launch switch's module.
 */
function isProductionDeployment(vercelEnv: string | undefined): boolean {
  return vercelEnv === "production";
}

/** The rule above, as a pure function (tested for every combination). */
export function isJourneyEnabled(launched: boolean, vercelEnv: string | undefined): boolean {
  return launched || !isProductionDeployment(vercelEnv);
}

/**
 * The `?tier=high|medium|low|static` override (testing, review captures, the numbers script) and
 * the `window.__journey` debug hooks it relies on: never on the production deployment.
 */
export function isTierOverrideAllowed(vercelEnv: string | undefined): boolean {
  return !isProductionDeployment(vercelEnv);
}

/**
 * The dev tuning panel (leva) and the performance overlay (r3f-perf): in `next dev`, and in builds
 * made with ENABLE_DEV_PAGES=1 (the dev-pages flag; never set on Vercel). Absent from every other
 * build – not merely hidden: the size report searches the built chunks for both packages.
 */
export function isJourneyDevTools(devServer: boolean, enableDevPages: string | undefined): boolean {
  return devServer || enableDevPages === "1";
}

/** This build: is the 3D layer built in? */
export const JOURNEY_ENABLED = isJourneyEnabled(JOURNEY_LAUNCHED, process.env.VERCEL_ENV);

/**
 * The build-time flags next.config.ts inlines into every bundle (server and browser) as
 * `process.env.<name>`. "on" / "off" strings, so a missing value (unit tests, which do not go
 * through next.config) reads as off: tests see the production page unless they stub a flag.
 */
export function journeyBuildEnv(options: {
  launched: boolean;
  vercelEnv: string | undefined;
  devServer: boolean;
  enableDevPages: string | undefined;
}): Record<"JOURNEY_LAYER" | "JOURNEY_TIER_OVERRIDE" | "JOURNEY_DEV_TOOLS", "on" | "off"> {
  const layer = isJourneyEnabled(options.launched, options.vercelEnv);
  const onOff = (v: boolean) => (v ? "on" : "off");
  return {
    JOURNEY_LAYER: onOff(layer),
    JOURNEY_TIER_OVERRIDE: onOff(layer && isTierOverrideAllowed(options.vercelEnv)),
    JOURNEY_DEV_TOOLS: onOff(layer && isJourneyDevTools(options.devServer, options.enableDevPages)),
  };
}
