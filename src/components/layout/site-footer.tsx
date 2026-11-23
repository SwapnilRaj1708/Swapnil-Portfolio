import { Link } from "@/components/ui/link";
import { identity, site } from "@/content";
import { Container } from "./container";

/** Footer: public email, profile links, copyright (BRIEF.md §8). */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <Container className="flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
        <address className="not-italic">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <li>
              <Link href={`mailto:${identity.email}`} className="break-all">
                {identity.email}
              </Link>
            </li>
            <li>
              <Link href={identity.links.github.href} variant="external">
                {identity.links.github.label}
              </Link>
            </li>
            <li>
              <Link href={identity.links.linkedin.href} variant="external">
                {identity.links.linkedin.label}
              </Link>
            </li>
          </ul>
        </address>
        <p className="label-mono text-text-muted">{site.copyright}</p>
      </Container>
    </footer>
  );
}
