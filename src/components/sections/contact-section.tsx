import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import { StatusChip } from "@/components/ui/status-chip";
import { getHomeSection, identity, services, ui } from "@/content";
import { HomeSection } from "./home-section";

/**
 * Chapter `uplink` (#contact): services, then how to get in touch. The direct email link is
 * always here; the one-question-at-a-time contact flow arrives in PF-019 (BRIEF.md §6).
 */
export function ContactSection() {
  return (
    <HomeSection section={getHomeSection("uplink")}>
      <div className="col-span-full flex flex-col gap-section lg:col-span-8 lg:col-start-5">
        <div className="flex flex-col gap-6">
          <h3 className="label-mono text-text-muted">{ui.contact.servicesHeading}</h3>
          <ul className="grid gap-4 md:grid-cols-3">
            {services.map((service) => (
              <li key={service.title}>
                <Panel className="h-full">
                  <h4 className="font-heading text-xl font-medium text-text">{service.title}</h4>
                  <p className="mt-3 text-text-muted">{service.line}</p>
                </Panel>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col items-start gap-6">
          <h3 className="label-mono text-text-muted">{ui.contact.contactHeading}</h3>
          <StatusChip>{identity.availability}</StatusChip>
          <dl className="grid w-full gap-x-6 gap-y-4 md:grid-cols-4">
            <dt className="label-mono text-text-muted md:pt-2">{ui.contact.emailLabel}</dt>
            <dd className="md:col-span-3">
              <Link href={`mailto:${identity.email}`} className="font-heading text-2xl break-all">
                {identity.email}
              </Link>
            </dd>
            <dt className="label-mono text-text-muted">{ui.contact.profilesLabel}</dt>
            <dd className="flex flex-wrap gap-x-6 gap-y-2 md:col-span-3">
              <Link href={identity.links.github.href} variant="external">
                {identity.links.github.label}
              </Link>
              <Link href={identity.links.linkedin.href} variant="external">
                {identity.links.linkedin.label}
              </Link>
            </dd>
            <dt className="label-mono text-text-muted">{ui.contact.timeZoneLabel}</dt>
            <dd className="text-text md:col-span-3">
              {identity.location} · {identity.timeZone}
            </dd>
          </dl>
        </div>
      </div>
    </HomeSection>
  );
}
