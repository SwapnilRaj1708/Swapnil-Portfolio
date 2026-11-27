import NextLink from "next/link";
import { identity, site } from "@/content";
import { Container } from "./container";
import { SiteNav } from "./site-nav";

/**
 * Sticky header: name (home link) on the left, persistent navigation on the right.
 * `data-site-header`: its controls take no scroll offset, so focusing one never scrolls the page
 * (PF-030, globals.css).
 */
export function SiteHeader() {
  return (
    <header data-site-header className="sticky top-0 z-40 border-b border-line bg-background">
      <Container className="flex min-h-header items-center justify-between gap-4 noscript:flex-wrap noscript:py-3">
        <NextLink
          href="/"
          className="label-mono inline-flex min-h-tap items-center gap-2 text-text transition-colors duration-fast ease-signal hover:text-accent-signal"
        >
          <span aria-hidden="true" className="size-2 shrink-0 bg-accent-trace" />
          {identity.name}
        </NextLink>
        <SiteNav items={site.nav} />
      </Container>
    </header>
  );
}
