"use client";

import { clsx } from "clsx";
import { ErrorPanel } from "@/components/layout/error-panel";
import { MAIN_ID } from "@/components/layout/skip-link";
import { errorCopy } from "@/content/data/error-copy";
import { activePairing } from "@/fonts";
import "./globals.css";

/**
 * Last-resort error page: the root layout itself failed, so this replaces the whole document
 * (Next requires its own <html> and <body>, styles and fonts). Same look as the rest of the site –
 * tokens, fonts, the panel of error.tsx – but without the header and footer, which are part of
 * the layout that failed. Links are plain anchors (a full page load). No metadata export is
 * allowed in a client component, so the title is a React <title>. The error is never shown.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className={clsx(activePairing.className, "h-full antialiased")}>
      <body className="flex min-h-full flex-col bg-background font-sans text-text">
        <title>{errorCopy.heading}</title>
        <main id={MAIN_ID} className="flex flex-1 flex-col">
          <ErrorPanel onRetry={retry} plainLinks />
        </main>
      </body>
    </html>
  );
}
