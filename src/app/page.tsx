import type { Metadata } from "next";
import { AboutSection } from "@/components/sections/about-section";
import { ContactSection } from "@/components/sections/contact-section";
import { ExperienceSection } from "@/components/sections/experience-section";
import { HeroSection } from "@/components/sections/hero-section";
import { ProjectsSection } from "@/components/sections/projects-section";
import { SkillsSection } from "@/components/sections/skills-section";

// Title and description come from the root layout; the canonical link is per page.
export const metadata: Metadata = { alternates: { canonical: "/" } };

/**
 * Home: the journey's content as designed static sections, in chapter order (BRIEF.md §3, D-24):
 * Hero (#top), About, Experience, Projects (#work), Skills, Services and Contact. This is what the
 * static tier shows; the 3D journey (PF-007 on) draws behind the same DOM.
 */
export default function Home() {
  return (
    <>
      <HeroSection />
      <AboutSection />
      <ExperienceSection />
      <ProjectsSection />
      <SkillsSection />
      <ContactSection />
    </>
  );
}
