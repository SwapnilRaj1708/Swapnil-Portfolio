import type { Metadata, Viewport } from "next";
import { clsx } from "clsx";
import { SiteShell } from "@/components/layout/site-shell";
import { SITE_LAUNCHED } from "@/config/site";
import { identity, site } from "@/content";
import { activePairing } from "@/fonts";
import { PALETTE } from "@/styles/palette";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: site.meta.home.title, template: site.meta.titleTemplate },
  description: site.meta.home.description,
  // Launch switch (src/config/site.ts). Child segments must not set `robots`:
  // metadata merges shallowly, so a child value would replace this one.
  robots: SITE_LAUNCHED ? undefined : { index: false, follow: false },
  // Social cards (PF-028). Only the parts shared by every page live here: Next fills og:title and
  // og:description (and the twitter:* ones) from each page's own title and description, and
  // og:image / twitter:image from the nearest `opengraph-image` file. Pages must not set
  // `openGraph` or `twitter` themselves: like `robots`, a child value would replace this one and
  // drop the image. No metadataBase yet: until the domain is connected, Next makes the image URLs
  // absolute with the Vercel deployment's own address (preview or production).
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
      <body className="flex min-h-full flex-col font-sans">
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
