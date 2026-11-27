import { describe, expect, it } from "vitest";
import { inPageAnchorId } from "./in-page-anchor";

const SITE = "https://swapnilraj.in";

describe("inPageAnchorId (PF-030 follow-up 1)", () => {
  it.each([
    // [link href, current address, expected id]
    ["/#about", `${SITE}/?utm_source=x`, "about"],
    ["/#contact", `${SITE}/?trk=public_profile`, "contact"],
    ["/#skills", `${SITE}/?tier=high&utm_source=x#about`, "skills"],
    ["/#about", `${SITE}/?utm_source=x#about`, "about"],
    [`${SITE}/#work`, `${SITE}/?utm_source=x`, "work"],
    ["/#caf%C3%A9", `${SITE}/?utm_source=x`, "café"],
  ])("%s on %s scrolls in place to #%s", (href, current, id) => {
    expect(inPageAnchorId(href, current)).toBe(id);
  });

  it.each([
    // No query on the address: a hash-only change, which Next's router scrolls itself.
    ["/#about", `${SITE}/`],
    ["/#about", `${SITE}/#contact`],
    // A bare fragment resolves against the address and keeps its query: also a hash-only change.
    ["#experience", `${SITE}/?utm_source=x`],
    // Another page: a real navigation (Next scrolls to the hash on the new page).
    ["/#about", `${SITE}/work?utm_source=x`],
    ["/#about", `${SITE}/work`],
    ["/work#top", `${SITE}/?utm_source=x`],
    // A query of the link's own: a navigation to that address.
    ["/?utm_source=y#about", `${SITE}/?utm_source=x`],
    ["/?utm_source=x#about", `${SITE}/?utm_source=x`],
    // No fragment, or an empty one.
    ["/", `${SITE}/?utm_source=x`],
    ["/#", `${SITE}/?utm_source=x`],
    // Another site.
    ["https://example.com/#about", `${SITE}/?utm_source=x`],
    // A fragment that is not valid percent-encoding.
    ["/#%E0%A4%A", `${SITE}/?utm_source=x`],
  ])("%s on %s is left to the router", (href, current) => {
    expect(inPageAnchorId(href, current)).toBeNull();
  });

  it("returns null for an address it cannot parse", () => {
    expect(inPageAnchorId("/#about", "not a url")).toBeNull();
  });
});
