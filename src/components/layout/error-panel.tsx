import { Button, buttonClasses } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { errorCopy } from "@/content/data/error-copy";
import { Container } from "./container";

export type ErrorPanelProps = {
  /** Re-renders the failed part of the page (Next's `retry`). */
  onRetry: () => void;
  /**
   * Plain anchors instead of client-side links: for global-error, where the root layout itself
   * failed and a full page load is the safer way out.
   */
  plainLinks?: boolean;
};

/**
 * The error message in the 404 page's look: label, h1, one line, "Try again" and the ways out
 * (Home, Work, Resume – BRIEF.md §2: Work and Resume one action away). It never shows the error's
 * message or stack: what went wrong is for the server log, not the visitor.
 */
export function ErrorPanel({ onRetry, plainLinks = false }: ErrorPanelProps) {
  const links = [
    { href: "/", label: errorCopy.home },
    { href: "/work", label: errorCopy.work },
    { href: "/resume", label: errorCopy.resume },
  ];
  return (
    <Container className="flex min-h-first-screen flex-col items-start justify-center gap-6 py-section">
      <p className="label-mono text-accent-trace">{errorCopy.code}</p>
      <h1 className="font-heading text-3xl font-medium text-text">{errorCopy.heading}</h1>
      <p className="max-w-prose text-lg text-text-muted">{errorCopy.body}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        <Button type="button" size="lg" onClick={onRetry}>
          {errorCopy.retry}
        </Button>
        {links.map((link) =>
          plainLinks ? (
            <a key={link.href} href={link.href} className={buttonClasses("secondary", "lg")}>
              {link.label}
            </a>
          ) : (
            <ButtonLink key={link.href} href={link.href} variant="secondary">
              {link.label}
            </ButtonLink>
          ),
        )}
      </div>
    </Container>
  );
}
