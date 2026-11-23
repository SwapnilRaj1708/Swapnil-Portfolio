import { clsx } from "clsx";
import { Panel } from "@/components/ui/panel";
import type { SkillGroup } from "@/content";

/** Skill groups as panels: group name, then its entries (no levels or bars – BRIEF.md §8). */
export function SkillGroups({ groups, headingLevel = 3, className }: { groups: readonly SkillGroup[]; headingLevel?: 2 | 3; className?: string }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <ul className={clsx("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {groups.map((group) => (
        <li key={group.name}>
          <Panel className="h-full">
            <Heading className="label-mono mb-4 text-accent-trace">{group.name}</Heading>
            <ul className="flex flex-col gap-2">
              {group.items.map((item) => (
                <li key={item} className="text-text">
                  {item}
                </li>
              ))}
            </ul>
          </Panel>
        </li>
      ))}
    </ul>
  );
}
