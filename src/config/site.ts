/**
 * Launch switch.
 *
 * While `false` (before launch):
 *   - every page renders `<meta name="robots" content="noindex, nofollow">`
 *   - every response carries the header `X-Robots-Tag: noindex, nofollow`
 *   - `/robots.txt` disallows everything
 *
 * Set it to `true` only in the launch item (PF-026), on the owner's go.
 * All three rules lift together; nothing else needs to change.
 */
export const SITE_LAUNCHED = false;

/** Value used for the `X-Robots-Tag` header while the site is not launched. */
export const NOINDEX_DIRECTIVE = "noindex, nofollow";
