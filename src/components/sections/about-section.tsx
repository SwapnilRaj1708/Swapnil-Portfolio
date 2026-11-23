import { about, getHomeSection } from "@/content";
import { HomeSection } from "./home-section";

/** Chapter `bus` (#about): the about text in its beats. */
export function AboutSection() {
  return (
    <HomeSection section={getHomeSection("bus")}>
      <div className="col-span-full flex max-w-prose flex-col gap-6 lg:col-span-7 lg:col-start-6">
        {about.beats.map((beat) => (
          <p key={beat} className="text-lg text-text">
            {beat}
          </p>
        ))}
      </div>
    </HomeSection>
  );
}
