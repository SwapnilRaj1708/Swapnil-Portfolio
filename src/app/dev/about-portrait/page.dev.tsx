// Dev-only page: built only with ENABLE_DEV_PAGES=1 (see next.config.ts). Never in production.
// The About section twice (PF-028): as it ships, and with a portrait frame beside the text, so the
// owner can decide whether to use a portrait (BRIEF.md §8: "undecided … none until then"). The frame
// holds a neutral placeholder graphic – no photo, no person.
import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { AboutSection } from "@/components/sections/about-section";

export const metadata: Metadata = { title: "About – portrait or not" };

/** A 4:5 frame with corner ticks, a crosshair and a label: the place a portrait would take. */
function PortraitPlaceholder() {
  return (
    <figure className="flex flex-col gap-3">
      <div className="relative aspect-banner-narrow w-full overflow-hidden rounded-sm border border-line bg-surface">
        <span aria-hidden="true" className="absolute top-0 left-0 h-px w-6 bg-accent-trace" />
        <span aria-hidden="true" className="absolute right-0 bottom-0 h-px w-6 bg-accent-trace" />
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-line" />
        <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-line" />
        <span aria-hidden="true" className="absolute top-1/2 left-1/2 size-16 -translate-1/2 rounded-full border border-line-strong" />
      </div>
      <figcaption className="label-mono text-text-muted">Portrait · placeholder</figcaption>
    </figure>
  );
}

function Variant({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line-strong">
      <Container className="py-6">
        <h2 className="label-mono text-accent-signal">{title}</h2>
      </Container>
      {children}
    </div>
  );
}

export default function AboutPortraitPage() {
  return (
    <>
      <Container className="flex flex-col gap-3 pt-12 pb-6">
        <p className="label-mono text-text-muted">Dev · PF-028</p>
        <h1 className="font-heading text-3xl font-medium text-text">About: with or without a portrait</h1>
      </Container>
      <Variant title="A · As it ships (no portrait)">
        <AboutSection />
      </Variant>
      <Variant title="B · With a portrait frame (placeholder)">
        <AboutSection id="about-with-portrait" portrait={<PortraitPlaceholder />} />
      </Variant>
    </>
  );
}
