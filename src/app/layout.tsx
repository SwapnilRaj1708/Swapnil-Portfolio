import type { Metadata } from "next";
import { clsx } from "clsx";
import { SiteShell } from "@/components/layout/site-shell";
import { SITE_LAUNCHED } from "@/config/site";
import { site } from "@/content/site";
import { activePairing } from "@/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: site.metadata.title, template: site.metadata.titleTemplate },
  description: site.metadata.description,
  // Launch switch (src/config/site.ts). Child segments must not set `robots`:
  // metadata merges shallowly, so a child value would replace this one.
  robots: SITE_LAUNCHED ? undefined : { index: false, follow: false },
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
