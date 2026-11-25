import { clsx } from "clsx";
import { Fragment, type ReactNode } from "react";
import { StatusDot } from "@/components/ui/status-chip";
import { identity, skills, ui } from "@/content";

/** CORE STACK is the first items of this skill group (D-38: React, Next.js, TypeScript). */
const CORE_STACK_GROUP = "Frontend";
const CORE_STACK_COUNT = 3;

function coreStack(): readonly string[] {
  const group = skills.find((g) => g.name === CORE_STACK_GROUP);
  if (!group) throw new Error(`Facts readout: no skill group named "${CORE_STACK_GROUP}"`);
  return group.items.slice(0, CORE_STACK_COUNT);
}

/** Values joined by a middle dot that is drawn, not read (screen readers hear the values only). */
function Joined({ parts }: { parts: readonly string[] }) {
  return parts.map((part, i) => (
    <Fragment key={part}>
      {i > 0 ? (
        <span aria-hidden="true" className="text-text-muted">
          {" · "}
        </span>
      ) : null}
      <span>{part}</span>
    </Fragment>
  ));
}

/**
 * The facts readout beside the About text (D-38, in place of a portrait): a machine-readout panel –
 * mono labels, values in the body face, a thin trace-accent line on top – built only from the
 * content (identity, skills); the labels are in `ui.about`. A description list, so screen readers
 * announce label and value pairs.
 */
export function AboutFacts({ className }: { className?: string }) {
  const rows: { label: string; value: ReactNode; key: string }[] = [
    { key: "role", label: ui.about.roleLabel, value: identity.role },
    { key: "based-in", label: ui.about.basedInLabel, value: <Joined parts={[identity.location, identity.timeZone]} /> },
    {
      key: "status",
      label: ui.about.statusLabel,
      value: (
        // The dot sits on the first line's centre (`h-lh` = one line high), also when the text wraps.
        <span className="flex items-start gap-3">
          <span className="flex h-lh items-center">
            <StatusDot />
          </span>
          <span>{identity.availability}</span>
        </span>
      ),
    },
    { key: "core-stack", label: ui.about.coreStackLabel, value: <Joined parts={coreStack()} /> },
  ];
  return (
    <div data-about-facts className={clsx("self-start rounded-sm border border-line bg-surface", className)}>
      <span aria-hidden="true" className="block h-px w-full bg-accent-trace" />
      <dl className="flex flex-col px-5 sm:px-6">
        {rows.map((row) => (
          <div key={row.key} data-fact={row.key} className="flex flex-col gap-1.5 border-t border-line py-4 first:border-t-0">
            <dt className="label-mono text-text-muted">{row.label}</dt>
            <dd className="text-base text-text">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
