import type { ContentInput } from "../schema";

/**
 * Projects (BRIEF.md §8 – details confirmed by the owner 2026-11-23; every project cleared to
 * show). Featured projects (in the journey and on the home page) come first, in the owner's
 * order; the rest appear on /work only. Twizzr is always "hyperlocal commerce" (the §8 framing).
 *
 * "approach" restates the work described in BRIEF.md §8 and nothing else. Optional fields are
 * left out where §8 says "later" or gives nothing (year, code link, outcome) – they are then not
 * shown. Media: stand-in screenshots of the live sites (`provisional: true`) until the owner's
 * own media arrives – see docs/content.md. `noPublicPreview: "behind-sign-in"` marks a project
 * whose live site opens on a sign-in, so there is no public screen to show (its readout tile says so).
 * Roles: owner decisions on the PF-006 review (2026-11-23).
 */
export const projects = [
  {
    slug: "twizzr",
    name: "Twizzr",
    oneLine: "Commerce for residential societies, from first commit to production.",
    org: "EL Nova Labs",
    year: "2025–2026",
    role: "Sole frontend/web engineer",
    stack: ["Next.js", "React", "TypeScript", "TanStack Query", "NextAuth v5", "STOMP/SockJS", "Tailwind"],
    problem:
      "A hyperlocal commerce platform for residential societies: residents order from merchants inside their society and pay cash on delivery.",
    approach: [
      "Built a two-persona monorepo for customers and merchants",
      "Built 5-tier role-based access",
      "Built a parallel multi-cart covering 7 edge cases",
      "Built real-time order alerts with custom notification tones",
    ],
    outcome: ["50% fewer redundant API calls", "Merchant onboarding 40% faster"],
    links: { live: "https://twizzr.in" },
    media: [
      {
        src: "/media/projects/twizzr/home.webp",
        alt: "Homepage of Twizzr",
        width: 1440,
        height: 900,
        provisional: true,
        source: "live-site screenshot, 2026-11-23",
      },
    ],
    featured: true,
    order: 1,
  },
  {
    slug: "softboard-lite",
    name: "Softboard Lite",
    oneLine: "A plug-and-play ERP, assembled from modules.",
    org: "EL Nova Labs",
    year: "2024–2025",
    role: "Frontend engineer",
    stack: ["React", "Redux", "Fluent UI", "Tailwind"],
    problem: "An ERP assembled from plug-and-play modules.",
    approach: [
      "Built 15+ modules",
      "Built an AI notice workflow that turns speech into structured notices: speech-to-text, prompt engineering and LLM transformation",
    ],
    outcome: ["Application startup 40% faster"],
    links: { live: "https://sbl.elnovalabs.com" },
    media: [],
    noPublicPreview: "behind-sign-in",
    featured: true,
    order: 2,
  },
  {
    slug: "pg-gurukul",
    name: "PG Gurukul",
    oneLine: "The website for a paragliding school in Bir, training pilots since 1993.",
    org: "EL Nova Labs",
    role: "Solo developer: design and build",
    stack: ["Next.js", "CMS"],
    problem:
      "A paragliding school in Bir, training pilots since 1993, shows its courses, instructors, testimonials and gallery online and takes enquiries.",
    approach: [
      "Built the site solo, end to end, with Next.js and a CMS",
      "Courses, instructors, testimonials, a gallery and an enquiry form",
    ],
    outcome: ["The school's team updates courses and content themselves through the CMS"],
    links: { live: "https://paragliding.guru" },
    media: [
      {
        src: "/media/projects/pg-gurukul/home.webp",
        alt: "Homepage of PG Gurukul",
        width: 1440,
        height: 900,
        provisional: true,
        source: "live-site screenshot, 2026-11-23",
      },
    ],
    featured: true,
    order: 3,
  },
  {
    slug: "creo",
    name: "CREO",
    oneLine: "A design studio's site, built to turn visitors into leads.",
    org: "Freelance",
    year: "March 2026",
    role: "Solo developer: design and build",
    stack: ["Next.js", "TypeScript", "Tailwind", "Zod", "Framer Motion"],
    problem: "A design studio's site that shows its services, pricing and client work, and turns visitors into leads.",
    approach: ["Showcased services, pricing and client work with a lead-focused flow"],
    outcome: ["More enquiries for the studio"],
    links: { live: "https://letscreo.in" },
    media: [
      {
        src: "/media/projects/creo/home.webp",
        alt: "Homepage of CREO",
        width: 1440,
        height: 900,
        provisional: true,
        source: "live-site screenshot, 2026-11-23",
      },
    ],
    featured: true,
    order: 4,
  },
  {
    slug: "engineerhub",
    name: "EngineerHUB website",
    oneLine: "A company platform: jobs, community and role-based dashboards.",
    org: "EngineerHUB",
    year: "2023–2024",
    role: "Software Development Intern",
    stack: ["React.js", "Vite"],
    problem: "EngineerHUB's company platform: a job portal, a community and dashboards with role-based access.",
    approach: ["Built the job portal, the community system and the RBAC dashboards", "Built real-time chat"],
    outcome: ["Frontend 35% faster using analytics insights"],
    links: { live: "https://engineerhub.in" },
    media: [
      {
        src: "/media/projects/engineerhub/home.webp",
        alt: "Homepage of the EngineerHUB website",
        width: 1440,
        height: 900,
        provisional: true,
        source: "live-site screenshot, 2026-11-23",
      },
    ],
    featured: true,
    order: 5,
  },
  {
    slug: "letschat",
    name: "LetsChat",
    oneLine: "WhatsApp-style messaging with an AI assistant built in.",
    org: "Personal",
    year: "May 2026",
    role: "Solo developer: design and build",
    stack: ["Next.js", "TypeScript", "tRPC", "OpenAI", "PostgreSQL", "Socket.io", "Auth.js", "Tailwind"],
    problem: "Real-time, WhatsApp-style messaging with a dedicated AI assistant.",
    approach: ["Built real-time messaging with a dedicated AI assistant"],
    outcome: ["Usable end to end with assistive technology"],
    links: { live: "https://letschat-web-umber.vercel.app" },
    media: [],
    noPublicPreview: "behind-sign-in",
    featured: false,
    order: 6,
  },
  {
    slug: "windows-10-clone",
    name: "Windows 10 Clone",
    oneLine: "Windows 10, rebuilt in the browser.",
    org: "Personal",
    year: "December 2025",
    role: "Solo developer: design and build",
    stack: ["React", "TypeScript", "Redux", "Tailwind"],
    problem: "The Windows 10 interface, rebuilt in the browser.",
    approach: ["Dynamic window management, a file explorer and a taskbar, all on centralised state"],
    links: { live: "https://windows-10-frontend.vercel.app" },
    media: [
      {
        src: "/media/projects/windows-10-clone/home.webp",
        alt: "Homepage of Windows 10 Clone",
        width: 1440,
        height: 900,
        provisional: true,
        source: "live-site screenshot, 2026-11-23",
      },
    ],
    featured: false,
    order: 7,
  },
  {
    slug: "recall",
    name: "Recall",
    oneLine: "One list that follows you to every screen you use.",
    org: "Personal",
    year: "2026",
    role: "Solo developer: design and build",
    stack: ["TypeScript", "React", "Tauri v2", "Chrome MV3", "Supabase"],
    problem:
      "One list of thoughts and tasks, kept in sync across your phone, desktop app, desktop widget, browser extension and the web.",
    approach: [
      "Capture from wherever you are",
      "Near-real-time sync",
      "Fully offline",
      "No edit lost when two devices change the same item",
    ],
    links: { live: "https://recall-web-flax.vercel.app", code: "https://github.com/SwapnilRaj1708/Recall" },
    media: [],
    noPublicPreview: "behind-sign-in",
    featured: false,
    order: 8,
  },
] satisfies ContentInput["projects"];
