/**
 * Launch switch and site address.
 *
 * The site is public only when BOTH hold:
 *   - `SITE_LAUNCHED` is `true` (set in PF-029, the stage 1 launch – BRIEF.md D-26), and
 *   - it runs as the Vercel production deployment (`VERCEL_ENV === "production"`, set by Vercel
 *     at build and run time).
 * Previews, local builds and the dev server are never public, whatever `SITE_LAUNCHED` says.
 *
 * While the site is not public:
 *   - every page renders `<meta name="robots" content="noindex, nofollow">`
 *   - every response carries the header `X-Robots-Tag: noindex, nofollow`
 *   - `/robots.txt` disallows everything and names no sitemap
 * When it is public, all three lift together and `/robots.txt` points to the sitemap.
 *
 * Pages are prerendered at build time, so the build's environment decides; Vercel sets
 * `VERCEL_ENV` for the build of every deployment.
 */
export const SITE_LAUNCHED = true;

/** The site's address (D-37): metadataBase, canonical links, sitemap, robots.txt. No trailing slash. */
export const SITE_URL = "https://swapnilraj.in";

/** Value used for the `X-Robots-Tag` header while the site is not public. */
export const NOINDEX_DIRECTIVE = "noindex, nofollow";

/** True only for the Vercel production deployment (not previews, not local builds). */
export function isProductionDeployment(vercelEnv: string | undefined): boolean {
  return vercelEnv === "production";
}

/** The launch rule above, as a pure function (tested for every combination). */
export function isSitePublic(launched: boolean, vercelEnv: string | undefined): boolean {
  return launched && isProductionDeployment(vercelEnv);
}

/** This build: the Vercel production deployment? (Analytics run only there, D-19.) */
export const IS_PRODUCTION_DEPLOYMENT = isProductionDeployment(process.env.VERCEL_ENV);

/** This build: public (indexable) or not. Everything that depends on the launch reads this. */
export const SITE_PUBLIC = isSitePublic(SITE_LAUNCHED, process.env.VERCEL_ENV);
