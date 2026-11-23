import type { ContentInput } from "../schema";

/**
 * Site frame: navigation, footer, resume file, page titles and descriptions, home sections.
 * Facts come from BRIEF.md §3, §5 and §8; the rest is plain interface wording.
 */
export const site = {
  nav: [
    { label: "Work", href: "/work", quick: true },
    { label: "About", href: "/#about" },
    { label: "Experience", href: "/#experience" },
    { label: "Skills", href: "/#skills" },
    { label: "Contact", href: "/#contact" },
    { label: "Resume", href: "/resume", quick: true },
  ],
  copyright: "© 2026 Swapnil Raj",
  // The owner's current resume, phone number included (D-27) – the only place a phone number
  // may appear. Copied from the assets folder; never edit it in place (see docs/content.md).
  resumePdf: { href: "/resume/swapnil-raj-resume.pdf", fileName: "swapnil-raj-resume.pdf" },
  meta: {
    home: {
      title: "Swapnil Raj – Full-Stack Engineer",
      description: "I build fast, real-time web products that people actually use.",
    },
    titleTemplate: "%s – Swapnil Raj",
    work: {
      title: "Work",
      description: "Projects by Swapnil Raj, Full-Stack Engineer: role, stack and outcome for each.",
    },
    resume: {
      title: "Resume",
      description: "Resume of Swapnil Raj, Full-Stack Engineer: experience, education and skills, with a PDF download.",
    },
    notFound: {
      title: "Page not found",
      description: "There is no page at this address.",
    },
  },
} satisfies ContentInput["site"];

/**
 * Home page sections = journey chapters, in the owner's order (BRIEF.md §3, D-24). The section
 * ids are the anchors the navigation and the 3D journey use.
 */
export const homeSections = [
  { chapter: "port", sectionId: "top", index: 1, label: "Hero", heading: "Swapnil Raj" },
  { chapter: "bus", sectionId: "about", index: 2, label: "About", heading: "About" },
  { chapter: "memory", sectionId: "experience", index: 3, label: "Experience", heading: "Experience" },
  { chapter: "array", sectionId: "work", index: 4, label: "Projects", heading: "Selected work" },
  { chapter: "core", sectionId: "skills", index: 5, label: "Skills", heading: "Skills" },
  { chapter: "uplink", sectionId: "contact", index: 6, label: "Contact", heading: "Services and contact" },
] satisfies ContentInput["homeSections"];
