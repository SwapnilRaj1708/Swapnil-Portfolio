import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { ButtonLink } from "@/components/ui/button-link";
import { site, ui } from "@/content";

export const metadata: Metadata = {
  title: site.meta.notFound.title,
  description: site.meta.notFound.description,
};

/**
 * 404 inside the site shell (header, navigation, footer): unknown URLs and unknown case-study
 * slugs. Work and Resume stay one action away (BRIEF.md §2). Server component only – Next sends
 * the root not-found with every route.
 */
export default function NotFound() {
  return (
    <Container className="flex min-h-first-screen flex-col items-start justify-center gap-6 py-section">
      <p className="label-mono text-accent-trace">{ui.notFound.code}</p>
      <h1 className="font-heading text-3xl font-medium text-text">{ui.notFound.heading}</h1>
      <p className="max-w-prose text-lg text-text-muted">{ui.notFound.body}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        <ButtonLink href="/">{ui.notFound.home}</ButtonLink>
        <ButtonLink href="/work" variant="secondary">
          {ui.notFound.work}
        </ButtonLink>
        <ButtonLink href="/resume" variant="secondary">
          {ui.notFound.resume}
        </ButtonLink>
      </div>
    </Container>
  );
}
