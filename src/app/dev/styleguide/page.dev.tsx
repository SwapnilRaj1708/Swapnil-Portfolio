// Dev-only page: built only with ENABLE_DEV_PAGES=1 (see next.config.ts). Never in production.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Container } from "@/components/layout/container";
import { SimpleViewSwitch } from "@/components/layout/simple-view-switch";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusChip } from "@/components/ui/status-chip";
import { site } from "@/content/site";
import { contrastRatio } from "@/lib/contrast";
import { parseColorTokens } from "@/lib/design-tokens";
import { CONTRAST_PAIRS, MIN_RATIO } from "@/styles/contrast-pairs";

export const metadata: Metadata = { title: "Style guide" };

// The stylesheet is the one source of the tokens; read it at build time.
const css = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
const colors = parseColorTokens(css);

function themeValues(prefix: string): [string, string][] {
  const out: [string, string][] = [];
  for (const m of css.matchAll(new RegExp(`--${prefix}-([a-z0-9-]+)\\s*:\\s*([^;]+);`, "g"))) {
    if (!m[1].includes("--")) out.push([m[1], m[2].trim()]);
  }
  return out;
}

const PALETTE = ["background", "surface", "surface-raised", "accent-trace", "accent-signal", "text", "text-muted"];
const TYPE_STEPS = ["display", "3xl", "2xl", "xl", "lg", "base", "sm"] as const;
const TYPE_CLASS: Record<(typeof TYPE_STEPS)[number], string> = {
  display: "text-display",
  "3xl": "text-3xl",
  "2xl": "text-2xl",
  xl: "text-xl",
  lg: "text-lg",
  base: "text-base",
  sm: "text-sm",
};
const VARIANTS: ButtonVariant[] = ["primary", "secondary", "ghost"];
const SIZES: ButtonSize[] = ["sm", "md", "lg"];
const INTENTS = ["Hiring for a role", "A freelance project", "A collaboration", "Just saying hello"];

function Block({ index, label, title, children }: { index: number; label: string; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-8 border-t border-line pt-10" aria-labelledby={`sg-${index}`}>
      <SectionHeading index={index} label={label} id={`sg-${index}`}>
        {title}
      </SectionHeading>
      {children}
    </section>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <p className="label-mono text-text-muted">{children}</p>;
}

export default function StyleguidePage() {
  return (
    <Container className="flex flex-col gap-16 py-section">
      <div className="flex flex-col gap-4">
        <p className="label-mono text-accent-trace">Dev only · ENABLE_DEV_PAGES=1</p>
        <h1 className="font-heading text-3xl font-medium">Style guide</h1>
        <p className="max-w-prose text-text-muted">
          Every token and component in every state. Hover and press states: interact with the controls.
        </p>
      </div>

      <Block index={1} label="Colour" title="Colour tokens">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {PALETTE.map((name) => (
            <li key={name} className="flex flex-col gap-2">
              <span
                className="block h-20 rounded-xs border border-line"
                style={{ backgroundColor: `var(--color-${name})` }}
              />
              <span className="font-mono text-sm">{name}</span>
              <span className="label-mono text-text-muted">{colors[name]}</span>
            </li>
          ))}
        </ul>
        <Caption>Derived tints (color-mix of palette tokens)</Caption>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {Object.keys(colors)
            .filter((n) => !PALETTE.includes(n))
            .map((name) => (
              <li key={name} className="flex flex-col gap-2">
                <span
                  className="block h-12 rounded-xs border border-line"
                  style={{ backgroundColor: `var(--color-${name})` }}
                />
                <span className="font-mono text-sm">{name}</span>
                <span className="label-mono text-text-muted">{colors[name]}</span>
              </li>
            ))}
        </ul>

        <Caption>Contrast of every pair in use (WCAG; text ≥ 4.5:1, non-text ≥ 3:1)</Caption>
        <div className="overflow-x-auto">
          <table className="w-full min-w-xl border-collapse text-left text-sm">
            <thead className="label-mono text-text-muted">
              <tr>
                <th className="border-b border-line py-2 pr-4 font-normal">Sample</th>
                <th className="border-b border-line py-2 pr-4 font-normal">Foreground / background</th>
                <th className="border-b border-line py-2 pr-4 font-normal">Ratio</th>
                <th className="border-b border-line py-2 pr-4 font-normal">Kind</th>
                <th className="border-b border-line py-2 font-normal">Used for</th>
              </tr>
            </thead>
            <tbody>
              {CONTRAST_PAIRS.map((p) => {
                const ratio = contrastRatio(colors[p.fg], colors[p.bg]);
                const pass = ratio >= MIN_RATIO[p.kind];
                return (
                  <tr key={`${p.fg}/${p.bg}/${p.kind}`}>
                    <td className="border-b border-line py-2 pr-4">
                      <span
                        className="inline-block rounded-xs px-2 py-1"
                        style={{ color: `var(--color-${p.fg})`, backgroundColor: `var(--color-${p.bg})` }}
                      >
                        Aa
                      </span>
                    </td>
                    <td className="border-b border-line py-2 pr-4 font-mono">
                      {p.fg} / {p.bg}
                    </td>
                    <td className="border-b border-line py-2 pr-4 font-mono">
                      {ratio.toFixed(2)}:1 {pass ? "✓" : "✗ FAIL"}
                    </td>
                    <td className="border-b border-line py-2 pr-4 text-text-muted">{p.kind}</td>
                    <td className="border-b border-line py-2 text-text-muted">{p.use}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Block>

      <Block index={2} label="Type" title="Type scale">
        <ul className="flex flex-col gap-6">
          {TYPE_STEPS.map((step) => (
            <li key={step} className="flex flex-col gap-1">
              <Caption>
                text-{step} · {themeValues("text").find(([n]) => n === step)?.[1]}
              </Caption>
              <p className={`${TYPE_CLASS[step]} ${step === "display" || step.endsWith("xl") ? "font-heading font-medium" : ""}`}>
                {step === "display" || step === "3xl" ? site.name : site.pitch}
              </p>
            </li>
          ))}
          <li className="flex flex-col gap-1">
            <Caption>label-mono · {themeValues("text").find(([n]) => n === "label")?.[1]}</Caption>
            <p className="label-mono">CH.01 · The Port</p>
          </li>
        </ul>
      </Block>

      <Block index={3} label="Space" title="Spacing, radii, timing">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="flex flex-col gap-3">
            <Caption>Spacing (4 px base: p-1 = 4 px)</Caption>
            {[1, 2, 3, 4, 6, 8, 12, 16].map((n) => (
              <div key={n} className="flex items-center gap-3">
                <span className="label-mono w-12 text-text-muted">{n}</span>
                <span className="h-3 bg-accent-trace" style={{ width: `calc(var(--spacing) * ${n})` }} />
              </div>
            ))}
            {themeValues("spacing").map(([n, v]) => (
              <p key={n} className="font-mono text-sm">
                {n} <span className="text-text-muted">{v}</span>
              </p>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <Caption>Radii</Caption>
            <div className="flex gap-4">
              <span className="size-12 rounded-none border border-text-muted" />
              <span className="size-12 rounded-xs border border-text-muted" />
              <span className="size-12 rounded-sm border border-text-muted" />
            </div>
            <p className="font-mono text-sm">
              none <span className="text-text-muted">0</span>
            </p>
            {themeValues("radius").map(([n, v]) => (
              <p key={n} className="font-mono text-sm">
                {n} <span className="text-text-muted">{v}</span>
              </p>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <Caption>Timing</Caption>
            {[...themeValues("transition-duration"), ...themeValues("ease")].map(([n, v]) => (
              <p key={n} className="font-mono text-sm">
                {n} <span className="text-text-muted">{v}</span>
              </p>
            ))}
            <p className="font-mono text-sm">
              linear <span className="text-text-muted">built in</span>
            </p>
            <p className="text-sm text-text-muted">Reduced motion: only opacity transitions; ambient loops stop.</p>
          </div>
        </div>
      </Block>

      <Block index={4} label="Controls" title="Buttons">
        {VARIANTS.map((variant) => (
          <div key={variant} className="flex flex-col gap-3">
            <Caption>{variant}</Caption>
            <div className="flex flex-wrap items-center gap-3">
              {SIZES.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  Transmit · {size}
                </Button>
              ))}
              <Button variant={variant} disabled>
                Transmit · disabled
              </Button>
              <Button variant={variant} className="focus-ring">
                Transmit · focus
              </Button>
            </div>
          </div>
        ))}
      </Block>

      <Block index={5} label="Links" title="Links">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Caption>inline</Caption>
            <p className="max-w-prose">
              {site.about[0]} <Link href={`mailto:${site.email}`}>{site.email}</Link>
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Caption>nav (default, current page)</Caption>
            <div className="flex flex-wrap gap-6">
              <Link href={site.nav[0].href} variant="nav">
                {site.nav[0].label}
              </Link>
              <Link href={site.nav[5].href} variant="nav" current>
                {site.nav[5].label}
              </Link>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Caption>external</Caption>
            <div className="flex flex-wrap gap-6">
              <Link href={site.links.github.href} variant="external">
                {site.links.github.label}
              </Link>
              <Link href={site.links.linkedin.href} variant="external">
                {site.links.linkedin.label}
              </Link>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Caption>focus</Caption>
            <div>
              <Link href={site.nav[0].href} variant="nav" className="focus-ring">
                {site.nav[0].label}
              </Link>
            </div>
          </div>
        </div>
      </Block>

      <Block index={6} label="Chips" title="Chips">
        <div className="grid gap-10 md:grid-cols-2">
          <ChipGroup legend="Radio · What brings you here?">
            {INTENTS.map((intent, i) => (
              <Chip key={intent} type="radio" name="sg-intent" value={intent} defaultChecked={i === 0}>
                {intent}
              </Chip>
            ))}
          </ChipGroup>
          <ChipGroup legend="Checkbox · Frontend">
            {["React", "Next.js", "TypeScript"].map((skill, i) => (
              <Chip key={skill} type="checkbox" name="sg-skills" value={skill} defaultChecked={i !== 1}>
                {skill}
              </Chip>
            ))}
          </ChipGroup>
          <ChipGroup legend="Disabled (unchecked, checked)">
            <Chip type="radio" name="sg-disabled" value="a" disabled>
              Remote
            </Chip>
            <Chip type="radio" name="sg-disabled" value="b" disabled defaultChecked>
              Hybrid
            </Chip>
          </ChipGroup>
          <ChipGroup legend="Focus">
            <Chip type="radio" name="sg-focus" value="a" className="focus-ring">
              On-site
            </Chip>
          </ChipGroup>
        </div>
      </Block>

      <Block index={7} label="Surfaces" title="Panel, status chip, switch">
        <div className="grid gap-6 md:grid-cols-2">
          <Panel label="CH.01 · The Port">
            <p className="text-text">{site.pitch}</p>
          </Panel>
          <Panel tone="raised" label="Status · Online">
            <p className="text-text-muted">{site.about[2]}</p>
          </Panel>
        </div>
        <div className="flex flex-col gap-3">
          <Caption>Status chip</Caption>
          <div>
            <StatusChip>{site.availability}</StatusChip>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Caption>Simple view switch (shared with the header – toggling here toggles both)</Caption>
          <div>
            <SimpleViewSwitch />
          </div>
        </div>
      </Block>

      <Block index={8} label="Headings" title="Section heading">
        <SectionHeading index={3} label="Experience" level={3}>
          Experience
        </SectionHeading>
      </Block>
    </Container>
  );
}
