import { RoleList } from "@/components/career/role-list";
import { experience, getHomeSection } from "@/content";
import { HomeSection } from "./home-section";

/** Chapter `memory` (#experience): roles, newest first. */
export function ExperienceSection() {
  return (
    <HomeSection section={getHomeSection("memory")}>
      <RoleList roles={experience} className="col-span-full lg:col-span-10" />
    </HomeSection>
  );
}
