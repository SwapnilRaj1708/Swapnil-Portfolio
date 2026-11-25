import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { IS_PRODUCTION_DEPLOYMENT } from "@/config/site";

/**
 * Vercel Web Analytics and Speed Insights (D-19, D-37) – on the Vercel production deployment only.
 * Previews, local builds and tests render nothing, so no script is requested there. Both are
 * cookieless (no consent banner) and load their script from the site's own `/_vercel/…` path,
 * the only analytics host STANDARDS.md §4 allows. The owner switches both on in Vercel.
 */
export function SiteAnalytics() {
  if (!IS_PRODUCTION_DEPLOYMENT) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
