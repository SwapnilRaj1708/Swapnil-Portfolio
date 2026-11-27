"use client";

import NextLink from "next/link";
import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { inPageAnchorId } from "@/lib/in-page-anchor";

export type AnchorLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string };

/**
 * `next/link` for a same-site href with a `#fragment` (PF-030 follow-up 1). On an address with a
 * query string (`/?utm_source=x`, `/?trk=…`) a click on an anchor to the page being shown (`/#about`)
 * scrolls to that section and keeps the visitor's query; Next's router would treat it as a
 * navigation to `/`, drop the query and not scroll (src/lib/in-page-anchor.ts). It does what Next
 * does for its own hash-only links: a history entry with the new hash (`history.pushState`, which
 * Next patches so its router follows the address) and `scrollIntoView()`, which honours the sticky
 * header's `scroll-margin-top` (globals.css). Focus stays where it is, as with Next's hash links.
 *
 * Every other click is left to Next unchanged – another page, an address without a query, a
 * modified click, a target that is not on the page. A handler that already took the click (the
 * journey's scroll spine on the 3D tiers, src/components/journey/scroll/scroll-spine.tsx, which
 * listens in the capture phase) wins: a prevented click is not touched. An `onClick` passed in
 * runs first (the phone menu closes itself).
 */
export function AnchorLink({ href, onClick, ...rest }: AnchorLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.currentTarget;
    if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return;
    const id = inPageAnchorId(link.href, window.location.href);
    const section = id === null ? null : document.getElementById(id);
    if (!section) return;
    event.preventDefault();
    const hash = new URL(link.href).hash;
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    section.scrollIntoView();
  };
  return <NextLink href={href} {...rest} onClick={handleClick} />;
}
