import type { Education } from "@/content";
import { formatYearMonth } from "@/content/format";

/** Education entries: dates, degree, institution and location. Shown on /resume. */
export function EducationList({ items }: { items: readonly Education[] }) {
  return (
    <ul className="flex flex-col gap-8">
      {items.map((item) => (
        <li key={`${item.institution}-${item.start}`} className="grid gap-x-6 gap-y-3 md:grid-cols-4">
          <p className="label-mono text-text-muted md:pt-1">
            <time dateTime={item.start}>{formatYearMonth(item.start)}</time> –{" "}
            <time dateTime={item.end}>{formatYearMonth(item.end)}</time>
          </p>
          <div className="md:col-span-3">
            <h3 className="font-heading text-xl font-medium text-text">{item.degree}</h3>
            <p className="text-text-muted">
              {item.institution} · {item.location}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
