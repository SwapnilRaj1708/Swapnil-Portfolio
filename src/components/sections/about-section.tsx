import type { ReactNode } from "react";
import { about, getHomeSection } from "@/content";
import { HomeSection } from "./home-section";

/**
 * Chapter `bus` (#about): the about text in its beats.
 *
 * `portrait` puts a frame beside the text from `lg` – only the dev page /dev/about-portrait uses it,
 * so the owner can judge the layout with and without a portrait (BRIEF.md §8: none until then).
 * `id` gives that second copy its own section id.
 */
export function AboutSection({ portrait, id }: { portrait?: ReactNode; id?: string } = {}) {
  return (
    <HomeSection section={getHomeSection("bus")} id={id}>
      <div className="col-span-full flex max-w-prose flex-col gap-6 lg:col-span-7">
        {about.beats.map((beat) => (
          <p key={beat} className="text-lg text-text">
            {beat}
          </p>
        ))}
      </div>
      {portrait ? <div className="col-span-3 md:col-span-4 lg:col-start-9">{portrait}</div> : null}
    </HomeSection>
  );
}
