import type { Metadata, Viewport } from "next";
import { clsx } from "clsx";
import { SiteAnalytics } from "@/components/layout/site-analytics";
import { SiteShell } from "@/components/layout/site-shell";
import { SITE_PUBLIC, SITE_URL } from "@/config/site";
import { identity, site } from "@/content";
import { activePairing } from "@/fonts";
import { PALETTE } from "@/styles/palette";
import "./globals.css";

export const metadata: Metadata = {
  // The site's address (D-37): canonical links and social-image URLs are made absolute with it,
  // on every deployment (previews too – they are noindex, and a preview's canonical is the live page).
  metadataBase: new URL(SITE_URL),
  title: { default: site.meta.home.title, template: site.meta.titleTemplate },
  description: site.meta.home.description,
  // Launch switch (src/config/site.ts): noindex unless this build is public. Child segments must
  // not set `robots`: metadata merges shallowly, so a child value would replace this one.
  robots: SITE_PUBLIC ? undefined : { index: false, follow: false },
  // Social cards (PF-028). Only the parts shared by every page live here: Next fills og:title and
  // og:description (and the twitter:* ones) from each page's own title and description, and
  // og:image / twitter:image from the nearest `opengraph-image` file. Pages must not set
  // `openGraph` or `twitter` themselves: like `robots`, a child value would replace this one and
  // drop the image. Each page sets its own `alternates.canonical` (never here: every page,
  // the 404 included, would inherit the home page's).
  openGraph: { type: "website", siteName: identity.name },
  twitter: { card: "summary_large_image" },
};

/** Browser chrome colour on phones: the page background (PF-028). */
export const viewport: Viewport = {
  themeColor: PALETTE.background,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={clsx(activePairing.className, "h-full antialiased")}>
      {/* With the 3D layer built in (D-39), body isolates its stacking context: the canvas layer
          (z-index below 0) then paints above body's own background instead of under it. */}
      <body className={clsx("flex min-h-full flex-col font-sans", process.env.JOURNEY_LAYER === "on" && "isolate")}>
        <SiteShell>{children}</SiteShell>
        <SiteAnalytics />
      </body>
    </html>
  );
}
