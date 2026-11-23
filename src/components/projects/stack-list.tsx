import { clsx } from "clsx";

/** A project's stack as a compact list of mono tags. */
export function StackList({ items, label, className }: { items: readonly string[]; label: string; className?: string }) {
  return (
    <ul aria-label={label} className={clsx("flex flex-wrap gap-x-2 gap-y-2", className)}>
      {items.map((item) => (
        <li key={item} className="rounded-xs border border-line px-2 py-0.5 font-mono text-label text-text-muted">
          {item}
        </li>
      ))}
    </ul>
  );
}
