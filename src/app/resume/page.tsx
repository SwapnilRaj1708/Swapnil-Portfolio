import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EducationList } from "@/components/career/education-list";
import { RoleList } from "@/components/career/role-list";
import { SkillGroups } from "@/components/career/skill-groups";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Link } from "@/components/ui/link";
import { education, experience, identity, site, skills, ui } from "@/content";

export const metadata: Metadata = {
  title: site.meta.resume.title,
  description: site.meta.resume.description,
};

function Part({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-8 border-t border-line py-12">
      <h2 id={id} className="label-mono text-accent-trace">
        {heading}
      </h2>
      {children}
    </section>
  );
}

/**
 * /resume – the resume as a page (experience, education, skills) with the PDF download
 * (BRIEF.md §5). The PDF is the owner's own file (D-27); the page shows no phone number.
 */
export default function ResumePage() {
  return (
    <>
      <PageHeader
        kicker={ui.resume.heading}
        title={identity.name}
        intro={
          <p>
            {identity.role} · {identity.location}
          </p>
        }
      >
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
        <ButtonLink href={site.resumePdf.href} download={site.resumePdf.fileName} type="application/pdf" className="mt-2">
          {ui.resume.download} <span className="text-label">({ui.resume.downloadNote})</span>
        </ButtonLink>
      </PageHeader>

      <Container className="pb-section">
        <Part id="resume-experience" heading={ui.resume.experienceHeading}>
          <RoleList roles={experience} />
        </Part>
        <Part id="resume-education" heading={ui.resume.educationHeading}>
          <EducationList items={education} />
        </Part>
        <Part id="resume-skills" heading={ui.resume.skillsHeading}>
          <SkillGroups groups={skills} />
        </Part>
      </Container>
    </>
  );
}
