import { Container } from "@/components/layout/container";
import { ButtonLink } from "@/components/ui/button-link";
import { StatusChip } from "@/components/ui/status-chip";
import { getHomeSection, identity, ui } from "@/content";

/** Chapter `port` (#top): name, role, pitch, availability – the 10-second rule (BRIEF.md §2). */
export function HeroSection() {
  const section = getHomeSection("port");
  return (
    <section id={section.sectionId} aria-label={section.label} data-chapter={section.chapter}>
      <Container grid className="min-h-first-screen content-center py-section">
        <div className="col-span-full flex flex-col items-start gap-6 lg:col-span-8">
          <h1 className="font-heading text-display font-medium text-text">{identity.name}</h1>
          <p className="label-mono text-text-muted">{identity.role}</p>
          <p className="max-w-prose text-xl text-text">{identity.pitch}</p>
          <StatusChip className="mt-2">{identity.availability}</StatusChip>
          <p className="font-mono text-sm text-text-muted">
            {ui.hero.locationLabel} {identity.location} · {identity.timeZone}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink href="/work">{ui.hero.workCta}</ButtonLink>
            <ButtonLink href="/resume" variant="secondary">
              {ui.hero.resumeCta}
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
