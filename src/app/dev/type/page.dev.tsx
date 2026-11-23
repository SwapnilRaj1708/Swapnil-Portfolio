// Dev-only page: built only with ENABLE_DEV_PAGES=1 (see next.config.ts). Never in production.
// The four pairings side by side, for the owner to pick one (PF-005). The site itself loads
// only the pairing exported from src/fonts/index.ts.
import type { Metadata } from "next";
import { clsx } from "clsx";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { SectionHeading } from "@/components/ui/section-heading";
import { about, identity } from "@/content";
import { activePairing, type FontPairing } from "@/fonts";
import { pairingA } from "@/fonts/pairing-a";
import { pairingB } from "@/fonts/pairing-b";
import { pairingC } from "@/fonts/pairing-c";
import { pairingD } from "@/fonts/pairing-d";

export const metadata: Metadata = { title: "Type pairings" };

const PAIRINGS: FontPairing[] = [pairingA, pairingB, pairingC, pairingD];
const INTENTS = ["Hiring for a role", "A freelance project", "A collaboration", "Just saying hello"];

function PairingColumn({ pairing }: { pairing: FontPairing }) {
  return (
    <section
      aria-labelledby={`pairing-${pairing.id}`}
      className={clsx(pairing.className, "flex min-w-0 flex-col gap-10 border-t border-line pt-8 font-sans")}
    >
      <div className="flex flex-col gap-2">
        <h2 id={`pairing-${pairing.id}`} className="label-mono text-accent-trace">
          Pairing {pairing.id}
          {pairing.id === activePairing.id ? " · active" : ""}
        </h2>
        <p className="font-mono text-sm text-text-muted">
          Headings {pairing.heading} · Body {pairing.body} · Labels {pairing.mono}
        </p>
      </div>

      {/* Hero */}
      <div className="flex flex-col gap-4">
        <p className="font-heading text-3xl font-medium">{identity.name}</p>
        <p className="label-mono text-text-muted">{identity.role}</p>
        <p className="text-lg">{identity.pitch}</p>
      </div>

      <SectionHeading index={2} label="About" level={3}>
        About
      </SectionHeading>

      <p className="text-base text-text">{about.beats[0]}</p>

      <div className="flex flex-col gap-2 border-l border-accent-trace pl-4">
        <p className="label-mono text-text">CH.01 · The Port</p>
        <p className="label-mono text-text-muted">Status · Online</p>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <Button>Transmit</Button>
        </div>
        <ChipGroup legend="What brings you here?">
          {INTENTS.map((intent, i) => (
            <Chip key={intent} type="radio" name={`intent-${pairing.id}`} value={intent} defaultChecked={i === 0}>
              {intent}
            </Chip>
          ))}
        </ChipGroup>
      </div>
    </section>
  );
}

export default function TypePage() {
  return (
    <Container className="flex flex-col gap-12 py-section">
      <div className="flex flex-col gap-4">
        <p className="label-mono text-accent-trace">Dev only · ENABLE_DEV_PAGES=1</p>
        <h1 className="font-heading text-3xl font-medium">Type pairings</h1>
        <p className="max-w-prose text-text-muted">
          Four pairings: A, B and C are SIL OFL 1.1; D is pairing A with Satoshi headings (ITF Free Font License).
          The site loads only the active one; switching is one line in src/fonts/index.ts.
        </p>
      </div>
      <div className="grid gap-12 md:grid-cols-2 xl:grid-cols-4 lg:gap-8">
        {PAIRINGS.map((p) => (
          <PairingColumn key={p.id} pairing={p} />
        ))}
      </div>
    </Container>
  );
}
