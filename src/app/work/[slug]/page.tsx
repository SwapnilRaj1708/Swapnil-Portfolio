import type { Metadata } from "next";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { CASE_STUDY_IMAGE_SIZES, CASE_STUDY_MORE_IMAGE_SIZES } from "@/components/projects/image-sizes";
import { ProjectScreen } from "@/components/projects/project-screen";
import { StackList } from "@/components/projects/stack-list";
import { Link } from "@/components/ui/link";
import { getProject, projects, site, ui } from "@/content";

type Params = { params: Promise<{ slug: string }> };

/**
 * The whole case study must be static output (Next 16.4 with Cache Components). It also means an
 * unknown slug is rendered completely before anything is sent, so notFound() can still set the
 * 404 status – with the default, a fallback shell would start streaming first (status 200).
 */
export const ensureStatic = "navigation";

/** Every project is prerendered at build. Any other slug renders the not-found page (404). */
export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const project = getProject((await params).slug);
  if (!project) return { title: site.meta.notFound.title, description: site.meta.notFound.description };
  return { title: project.name, description: project.oneLine, alternates: { canonical: `/work/${project.slug}` } };
}

function Block({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-x-6 gap-y-4 border-t border-line py-10 md:grid-cols-4">
      <h2 id={id} className="label-mono text-accent-trace md:pt-1">
        {heading}
      </h2>
      <div className="max-w-prose md:col-span-3">{children}</div>
    </section>
  );
}

function Points({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-lg text-text">
          <span aria-hidden="true" className="mt-3.5 h-px w-3 shrink-0 bg-accent-trace" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** /work/<slug> – case study: problem, role, approach, outcome, stack, links, media (BRIEF.md §5). */
export default async function CaseStudyPage({ params }: Params) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  const index = projects.indexOf(project);
  const previous = index > 0 ? projects[index - 1] : undefined;
  const next = index < projects.length - 1 ? projects[index + 1] : undefined;
  const moreMedia = project.media.slice(1);

  return (
    <article>
      <PageHeader
        kicker={
          <Link href="/work" variant="nav">
            ← {ui.caseStudy.backToWork}
          </Link>
        }
        title={project.name}
        intro={<p>{project.oneLine}</p>}
      >
        <dl className="mt-4 grid w-full gap-x-6 gap-y-5 border-t border-line pt-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <dt className="label-mono text-text-muted">{ui.caseStudy.roleLabel}</dt>
            <dd className="text-text">{project.role}</dd>
          </div>
          <div className="flex flex-col gap-2">
            <dt className="label-mono text-text-muted">{ui.caseStudy.orgLabel}</dt>
            <dd className="text-text">
              {project.org}
              {project.year ? ` · ${project.year}` : null}
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <dt className="label-mono text-text-muted">{ui.caseStudy.stackLabel}</dt>
            <dd>
              <StackList items={project.stack} label={ui.caseStudy.stackLabel} />
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <dt className="label-mono text-text-muted">{ui.caseStudy.linksLabel}</dt>
            <dd className="flex flex-wrap gap-x-5 gap-y-2">
              <Link href={project.links.live} variant="external">
                {ui.caseStudy.liveLink}
              </Link>
              {project.links.code ? (
                <Link href={project.links.code} variant="external">
                  {ui.caseStudy.codeLink}
                </Link>
              ) : null}
            </dd>
          </div>
        </dl>
      </PageHeader>

      {/* The first screenshot in the display frame (surface bezel, never dimmed on its own page) –
          or, without one, the readout tile as a short band. */}
      <Container className="pb-12">
        <ProjectScreen project={project} sizes={CASE_STUDY_IMAGE_SIZES} eager placement="page" />
      </Container>

      <Container className="pb-section">
        <Block id="problem" heading={ui.caseStudy.problemHeading}>
          <p className="text-lg text-text">{project.problem}</p>
        </Block>
        <Block id="approach" heading={ui.caseStudy.approachHeading}>
          <Points items={project.approach} />
        </Block>
        {project.outcome ? (
          <Block id="outcome" heading={ui.caseStudy.outcomeHeading}>
            <Points items={project.outcome} />
          </Block>
        ) : null}
        {moreMedia.length > 0 ? (
          <Block id="media" heading={ui.caseStudy.mediaHeading}>
            <div className="flex flex-col gap-6">
              {moreMedia.map((media) => (
                <ProjectScreen key={media.src} project={project} media={media} sizes={CASE_STUDY_MORE_IMAGE_SIZES} placement="page" />
              ))}
            </div>
          </Block>
        ) : null}

        <nav aria-label={ui.caseStudy.projectNav} className="grid gap-4 border-t border-line pt-10 sm:grid-cols-2">
          {previous ? (
            <NextLink href={`/work/${previous.slug}`} className="group flex flex-col gap-1">
              <span className="label-mono text-text-muted">← {ui.caseStudy.previousLabel}</span>
              <span className="font-heading text-xl text-text transition-colors duration-fast ease-signal group-hover:text-accent-signal">
                {previous.name}
              </span>
            </NextLink>
          ) : (
            <span />
          )}
          {next ? (
            <NextLink href={`/work/${next.slug}`} className="group flex flex-col gap-1 sm:items-end sm:text-right">
              <span className="label-mono text-text-muted">{ui.caseStudy.nextLabel} →</span>
              <span className="font-heading text-xl text-text transition-colors duration-fast ease-signal group-hover:text-accent-signal">
                {next.name}
              </span>
            </NextLink>
          ) : null}
        </nav>
      </Container>
    </article>
  );
}
