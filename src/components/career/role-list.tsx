import { clsx } from "clsx";
import { ui, type Role } from "@/content";
import { formatYearMonth } from "@/content/format";

/** Roles, newest first: dates, title, company and location, outcomes. Home and /resume. */
export function RoleList({ roles, headingLevel = 3, className }: { roles: readonly Role[]; headingLevel?: 2 | 3; className?: string }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <ol className={clsx("flex flex-col", className)}>
      {roles.map((role) => (
        <li
          key={`${role.company}-${role.start}`}
          className="grid gap-x-6 gap-y-3 border-t border-line py-8 first:border-t-0 first:pt-0 last:pb-0 md:grid-cols-4"
        >
          <p className="label-mono text-text-muted md:pt-1">
            <time dateTime={role.start}>{formatYearMonth(role.start)}</time>
            {" – "}
            {role.end ? <time dateTime={role.end}>{formatYearMonth(role.end)}</time> : ui.experience.present}
          </p>
          <div className="flex flex-col gap-3 md:col-span-3">
            <div>
              <Heading className="font-heading text-xl font-medium text-text">{role.title}</Heading>
              <p className="text-text-muted">
                {role.company} · {role.location}
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {role.outcomes.map((outcome) => (
                <li key={outcome} className="flex gap-3 text-text">
                  <span aria-hidden="true" className="mt-2.5 h-px w-3 shrink-0 bg-accent-trace" />
                  <span>{outcome}</span>
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ol>
  );
}
