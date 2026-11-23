import { StillPicture } from "@/components/stills/still-picture";
import { StillScrims } from "@/components/stills/still-scrims";
import { ButtonLink } from "@/components/ui/button-link";
import { StatusChip } from "@/components/ui/status-chip";
import { getHomeSection, getStill, identity, ui } from "@/content";

/** The hero's crop switch: the wide Port still on landscape screens, the portrait one otherwise. */
const WIDE_MEDIA = "(orientation: landscape)";

/**
 * Chapter `port` (#top): name, role, pitch, availability – the 10-second rule (BRIEF.md §2) – over
 * the Port still (PF-028), the static tier's stand-in for the 3D hero.
 *
 * The text keeps to the still's text-safe area (look bible, BRIEF.md §4): on landscape screens the
 * left 40 % of the wide still (`hero-copy` in globals.css sizes the column to it); on portrait
 * screens the top 40 % of the portrait still, so name, role, pitch and place sit at the top and the
 * availability chip and the two links – each on its own solid surface – stand below the port.
 * The still loads at once at high priority (it is the largest paint) and only covers a box whose
 * size does not depend on it: no layout shift.
 */
export function HeroSection() {
  const section = getHomeSection("port");
  return (
    <section
      id={section.sectionId}
      aria-label={section.label}
      data-chapter={section.chapter}
      className="relative isolate flex min-h-first-screen flex-col overflow-hidden bg-background"
    >
      <div aria-hidden="true" className="absolute inset-y-0 right-0 left-0 -z-10 landscape:hero-still-inset">
        <StillPicture
          still={getStill("port")}
          wideMedia={WIDE_MEDIA}
          eager
          className="absolute inset-0 size-full object-cover object-top landscape:object-left"
        />
        <StillScrims chapter="port" wideClassName="hidden landscape:block" portraitClassName="landscape:hidden" />
      </div>

      <div className="flex w-full flex-1 flex-col gap-10 px-gutter py-8 portrait:mx-auto portrait:max-w-content portrait:justify-between landscape:hero-copy landscape:justify-center landscape:py-section">
        <div data-over-still="port" className="flex flex-col items-start gap-3 landscape:gap-5">
          <h1 className="font-heading text-display font-medium text-text">{identity.name}</h1>
          <p className="label-mono text-text-muted">{identity.role}</p>
          <p className="max-w-prose text-xl text-text">{identity.pitch}</p>
          <p className="font-mono text-sm text-text-muted">
            {ui.hero.locationLabel} {identity.location} · {identity.timeZone}
          </p>
        </div>
        <div className="flex flex-col items-start gap-6">
          <StatusChip>{identity.availability}</StatusChip>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/work">{ui.hero.workCta}</ButtonLink>
            <ButtonLink href="/resume" variant="secondary">
              {ui.hero.resumeCta}
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
