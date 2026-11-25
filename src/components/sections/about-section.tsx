import { about, getHomeSection } from "@/content";
import { AboutFacts } from "./about-facts";
import { HomeSection } from "./home-section";

/**
 * Chapter `bus` (#about): the about text in its beats and the facts readout (D-38). From `lg` the
 * readout sits beside the text (columns 9–12); below `lg` it follows the text, so the reading order
 * is the same at every width.
 */
export function AboutSection() {
  return (
    <HomeSection section={getHomeSection("bus")}>
      <div className="col-span-full flex max-w-prose flex-col gap-6 lg:col-span-7">
        {about.beats.map((beat) => (
          <p key={beat} className="text-lg text-text">
            {beat}
          </p>
        ))}
      </div>
      <AboutFacts className="col-span-full md:col-span-6 lg:col-span-4 lg:col-start-9" />
    </HomeSection>
  );
}
