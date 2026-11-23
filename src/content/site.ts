/**
 * Site-wide content: metadata, navigation, footer. Every value comes from BRIEF.md §8 and §5
 * (approved by the owner in PF-001) – nothing here may be invented. PF-006 folds this file into
 * the typed, build-validated content model.
 */

export type NavItem = {
  label: string;
  href: string;
};

export type ProfileLink = {
  label: string;
  href: string;
};

export type SiteContent = {
  name: string;
  role: string;
  /** One-line pitch, 12 words at most. */
  pitch: string;
  /** Shown in the status chip. */
  availability: string;
  /** Public contact email (owner, 2026-11-21: shown in the footer and the contact chapter). */
  email: string;
  links: {
    github: ProfileLink;
    linkedin: ProfileLink;
  };
  /** Persistent navigation (BRIEF.md §5), in this order. */
  nav: readonly NavItem[];
  copyright: string;
  /** About text in its beats (BRIEF.md §8, provisional – the owner will revise it). */
  about: readonly string[];
  metadata: {
    title: string;
    titleTemplate: string;
    description: string;
  };
};

const name = "Swapnil Raj";
const role = "Full-Stack Engineer";
const pitch = "I build fast, real-time web products that people actually use.";

export const site = {
  name,
  role,
  pitch,
  availability: "Open to full-time roles and freelance projects",
  email: "raj.swapnil1708@gmail.com",
  links: {
    github: { label: "GitHub", href: "https://github.com/SwapnilRaj1708" },
    linkedin: { label: "LinkedIn", href: "https://www.linkedin.com/in/swapnilraj1708" },
  },
  nav: [
    { label: "Work", href: "/work" },
    { label: "About", href: "/#about" },
    { label: "Experience", href: "/#experience" },
    { label: "Skills", href: "/#skills" },
    { label: "Contact", href: "/#contact" },
    { label: "Resume", href: "/resume" },
  ],
  copyright: "© 2026 Swapnil Raj",
  about: [
    "I'm Swapnil, a full-stack engineer in Lucknow. I build web products that make complicated work feel simple, and keep working when real people lean on them.",
    "At EL Nova Labs I led the frontend of Twizzr, a hyperlocal commerce platform for residential societies: real-time ordering, a parallel multi-cart system, and merchant tools that cut onboarding time by 40%. Before that, I built EngineerHUB's platform from scratch: job portal, dashboards and real-time chat.",
    "I like the problems underneath the UI: state, data flow and real-time behaviour. I'm looking for a team where I can own features end to end.",
  ],
  metadata: {
    title: `${name} – ${role}`,
    titleTemplate: `%s – ${name}`,
    description: pitch,
  },
} as const satisfies SiteContent;
