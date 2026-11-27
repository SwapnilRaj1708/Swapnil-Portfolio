/**
 * In-page anchors on an address with a query string (PF-030 follow-up 1).
 *
 * The header's section links are anchors to the home page (`/#about`, `/#contact`). Visitors often
 * arrive with a query on the address – LinkedIn adds `?trk=…`, campaigns `?utm_source=…`. A click on
 * `/#contact` while the address is `/?utm_source=x` is, to Next's router, a navigation to another
 * URL (`/` without the query), not a hash change: it drops the query, keeps the static home page's
 * segment (nothing new to render) and so never runs its hash scroll, which happens only for a
 * hash-only change or on a newly rendered segment. The hash changed and the page stayed put.
 *
 * `inPageAnchorId` picks out exactly that case – a bare anchor (no query of its own) to the page
 * being shown, on an address that has a query – and returns the id to scroll to. Everything else
 * (another page, no query on the address – a hash-only change Next scrolls itself –, a link with a
 * query of its own) is a navigation and returns null.
 */
export function inPageAnchorId(href: string, currentHref: string): string | null {
  let url: URL;
  let here: URL;
  try {
    here = new URL(currentHref);
    url = new URL(href, here);
  } catch {
    return null;
  }
  if (url.origin !== here.origin || url.pathname !== here.pathname) return null;
  if (url.hash.length < 2) return null;
  if (url.search !== "" || here.search === "") return null;
  try {
    return decodeURIComponent(url.hash.slice(1));
  } catch {
    return null;
  }
}
