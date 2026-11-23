import { SkillGroups } from "@/components/career/skill-groups";
import { getHomeSection, skills } from "@/content";
import { HomeSection } from "./home-section";

/** Chapter `core` (#skills): the four skill groups. */
export function SkillsSection() {
  return (
    <HomeSection section={getHomeSection("core")}>
      <SkillGroups groups={skills} className="col-span-full" />
    </HomeSection>
  );
}
