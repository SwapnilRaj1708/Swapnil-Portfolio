import NextLink from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { AnchorLink } from "./anchor-link";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button";

export type ButtonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

/**
 * A link that looks like a button – for navigation actions ("See the work", "Download the PDF").
 * Same-site pages use Next's client routing; files (`download`), mailto: and other sites use a
 * plain anchor.
 */
export function ButtonLink({ href, variant = "primary", size = "lg", className, children, ...rest }: ButtonLinkProps) {
  const classes = buttonClasses(variant, size, className);
  const plainAnchor = !href.startsWith("/") || rest.download !== undefined || /\.[a-z0-9]+$/i.test(href);
  if (plainAnchor) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }
  // An anchor (`/#contact`) must also scroll on an address with a query string (PF-030 follow-up 1).
  const Internal = href.includes("#") ? AnchorLink : NextLink;
  return (
    <Internal href={href} className={classes} {...rest}>
      {children}
    </Internal>
  );
}
