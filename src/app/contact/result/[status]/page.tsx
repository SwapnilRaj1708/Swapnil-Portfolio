import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { ButtonLink } from "@/components/ui/button-link";
import { Link } from "@/components/ui/link";
import { identity, ui } from "@/content";
import { RESULT_STATUSES, type ResultStatus } from "@/lib/contact/fields";

type Params = { params: Promise<{ status: string }> };

/** Fully static, so an unknown status is a real 404 (as on /work/[slug]). */
export const ensureStatic = "navigation";

export function generateStaticParams() {
  return RESULT_STATUSES.map((status) => ({ status }));
}

const r = ui.contactResult;
const COPY: Record<ResultStatus, { title: string; body: string }> = {
  sent: { title: r.sentTitle, body: r.sentBody },
  invalid: { title: r.invalidTitle, body: r.invalidBody },
  "rate-limited": { title: r.rateLimitedTitle, body: r.rateLimitedBody },
  failed: { title: r.failedTitle, body: r.failedBody },
};

function isStatus(value: string): value is ResultStatus {
  return (RESULT_STATUSES as readonly string[]).includes(value);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { status } = await params;
  if (!isStatus(status)) return {};
  return { title: COPY[status].title, description: COPY[status].body, alternates: { canonical: `/contact/result/${status}` } };
}

/**
 * Where the plain contact form (no JavaScript) lands after it posts to /api/contact: sent, or why
 * not. With JavaScript the flow shows these states in place and never comes here.
 */
export default async function ContactResultPage({ params }: Params) {
  const { status } = await params;
  if (!isStatus(status)) notFound();
  const copy = COPY[status];

  return (
    <Container className="flex min-h-first-screen flex-col items-start justify-center gap-6 py-section">
      <p className="label-mono text-accent-trace">{r.kicker}</p>
      <h1 className="font-heading text-3xl font-medium text-text">{copy.title}</h1>
      <p className="max-w-prose text-lg text-text-muted">{copy.body}</p>
      {status === "sent" ? null : (
        <p className="text-text">
          {r.emailInstead}:{" "}
          <Link href={`mailto:${identity.email}`} className="break-all">
            {identity.email}
          </Link>
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-3">
        <ButtonLink href="/">{r.home}</ButtonLink>
        {status === "sent" ? null : (
          <ButtonLink href="/#contact" variant="secondary">
            {r.backToForm}
          </ButtonLink>
        )}
      </div>
    </Container>
  );
}
