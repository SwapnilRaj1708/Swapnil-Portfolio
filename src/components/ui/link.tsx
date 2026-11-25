import { clsx } from "clsx";
import NextLink from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

export type LinkVariant = "inline" | "nav" | "external";

export type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  variant?: LinkVariant;
  /**
   * Nav links: `true` / "page" marks the link for the page being shown (`aria-current="page"`);
   * "location" marks the home section the visitor is in (`aria-current="location"`, PF-008).
   */
  current?: boolean | "page" | "location";
  children: ReactNode;
};

/**
 * The current-chapter mark (PF-008): the link in full text colour with a trace-accent underline –
 * a shape, not only a colour. Only where the 3D layer is built in (the mark is set only there), so
 * the production deployment's markup stays the stage 1 markup.
 */
const LOCATION_STYLE =
  process.env.JOURNEY_LAYER === "on"
    ? " aria-[current=location]:text-text aria-[current=location]:underline aria-[current=location]:decoration-accent-trace " +
      "aria-[current=location]:decoration-2 aria-[current=location]:underline-offset-8"
    : "";

const styles: Record<LinkVariant, string> = {
  inline:
    "text-accent-signal underline decoration-signal-line decoration-1 underline-offset-4 " +
    "transition-colors duration-fast ease-signal hover:decoration-accent-signal",
  nav:
    "label-mono inline-flex min-h-tap items-center text-text-muted transition-colors duration-fast ease-signal " +
    "hover:text-text aria-[current=page]:text-accent-signal" +
    LOCATION_STYLE,
  external:
    "inline-flex items-center gap-1 text-text underline decoration-line-strong decoration-1 underline-offset-4 " +
    "transition-colors duration-fast ease-signal hover:text-accent-signal hover:decoration-accent-signal",
};

function ExternalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" stroke="currentColor">
      <path d="M5 11 11 5M6 5h5v5" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Link: `inline` for links in running text, `nav` for navigation, `external` for other sites
 * (opens in a new tab, says so to screen readers). Same-site links use Next's client routing;
 * mailto: and other non-http links use a plain anchor.
 */
export function Link({ href, variant = "inline", current, className, children, ...rest }: LinkProps) {
  const classes = clsx(styles[variant], className);

  if (variant === "external") {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
        {children}
        <ExternalIcon />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }

  if (!href.startsWith("/")) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }

  const ariaCurrent = current === "location" ? "location" : current ? "page" : undefined;
  return (
    <NextLink href={href} aria-current={ariaCurrent} className={classes} {...rest}>
      {children}
    </NextLink>
  );
}
