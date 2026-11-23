/**
 * The content model: every word about the owner, typed and validated.
 *
 * Data files (src/content/data/) hold the copy from BRIEF.md §8; this module parses them with
 * the zod schemas (src/content/schema.ts) the first time it is imported. Every page imports it
 * while `next build` prerenders, so missing or invalid content fails the build with a message
 * that names the field (next.config.ts additionally checks that media and resume files exist).
 *
 * Server-side only: client components receive what they need as props.
 */
import { contactFlow as contactFlowData } from "./data/contact-flow";
import { education as educationData, experience as experienceData, services as servicesData, skills as skillsData } from "./data/career";
import { about as aboutData, identity as identityData } from "./data/identity";
import { projects as projectsData } from "./data/projects";
import { homeSections as homeSectionsData, site as siteData } from "./data/site";
import { ui as uiData } from "./data/ui";
import type { HomeSection, Project } from "./schema";
import { parseContent, parseUi } from "./validate";

export const content = parseContent({
  identity: identityData,
  about: aboutData,
  experience: experienceData,
  education: educationData,
  skills: skillsData,
  services: servicesData,
  projects: projectsData,
  contactFlow: contactFlowData,
  site: siteData,
  homeSections: homeSectionsData,
});

export const ui = parseUi(uiData);

export const { identity, about, experience, education, skills, services, contactFlow, site, homeSections } = content;

/** All projects in display order: featured first, then the rest. */
export const projects: readonly Project[] = [...content.projects].sort((a, b) => a.order - b.order);

/** The featured projects (home page, journey), in order. */
export const featuredProjects: readonly Project[] = projects.filter((p) => p.featured);

/** Projects shown on /work only. */
export const moreProjects: readonly Project[] = projects.filter((p) => !p.featured);

export function getProject(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

/** The home-page section of a chapter (BRIEF.md §3). */
export function getHomeSection(chapter: HomeSection["chapter"]): HomeSection {
  const section = homeSections.find((s) => s.chapter === chapter);
  if (!section) throw new Error(`No home section for chapter "${chapter}"`);
  return section;
}

export type { Content, Education, HomeSection, Media, NavItem, Project, Role, Service, SkillGroup } from "./schema";
