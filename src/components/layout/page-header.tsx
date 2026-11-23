import type { ReactNode } from "react";
import { Container } from "./container";

/** Top of a fast-lane page: optional mono kicker, the page's one h1, optional intro and extras. */
export function PageHeader({
  kicker,
  title,
  intro,
  children,
}: {
  kicker?: ReactNode;
  title: string;
  intro?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Container className="flex flex-col items-start gap-5 pt-16 pb-12 md:pt-24">
      {kicker ? <div className="label-mono text-text-muted">{kicker}</div> : null}
      <h1 className="font-heading text-3xl font-medium text-text">{title}</h1>
      {intro ? <div className="max-w-prose text-xl text-text">{intro}</div> : null}
      {children}
    </Container>
  );
}
