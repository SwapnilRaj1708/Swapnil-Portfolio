import type { ContentInput } from "../schema";

/** Experience, newest first (BRIEF.md §8, confirmed by the owner 2026-11-21). */
export const experience = [
  {
    company: "EL Nova Labs",
    title: "Software Development Engineer 2",
    location: "Lucknow",
    start: "2025-04",
    end: null,
    outcomes: [
      "Led the frontend of Twizzr, a hyperlocal commerce platform for residential societies (React, Next.js, TanStack)",
      "Built a parallel multi-cart system handling merchant availability, pricing and stock",
      "Cut redundant API calls by 50% through caching and better data fetching",
      "Cut merchant onboarding time by 40%",
    ],
  },
  {
    company: "EL Nova Labs",
    title: "Software Development Engineer 1",
    location: "Lucknow",
    start: "2024-08",
    end: "2025-03",
    outcomes: [
      "Built 15+ modules for Softboard, a plug-and-play ERP (React, Redux, Fluent UI, Tailwind)",
      "Built an AI notice workflow turning speech into structured notices (speech-to-text, prompt engineering, LLM transformation)",
      "40% faster application startup through profiling and refactoring",
    ],
  },
  {
    company: "EngineerHUB",
    title: "Software Development Intern",
    location: "Delhi",
    start: "2023-03",
    end: "2024-06",
    outcomes: [
      "Built the company platform: job portal, community system and RBAC dashboards",
      "Built a real-time chat system",
      "35% faster frontend performance using analytics insights",
    ],
  },
] satisfies ContentInput["experience"];

/** Education (BRIEF.md §8, from the owner's resume; grade not shown). Shown on /resume. */
export const education = [
  {
    degree: "B.Tech, Computer Science and Engineering",
    institution: "Ajay Kumar Garg Engineering College",
    location: "Ghaziabad, Uttar Pradesh",
    start: "2020-10",
    end: "2024-07",
  },
] satisfies ContentInput["education"];

/** Skills: four groups, six entries at most each, no levels (BRIEF.md §8). */
export const skills = [
  { name: "Frontend", items: ["React", "Next.js", "TypeScript", "Tailwind CSS", "Redux", "TanStack Query"] },
  { name: "Backend", items: ["Node.js", "Express.js", "PostgreSQL", "MongoDB", "tRPC", "Socket.io"] },
  { name: "AI", items: ["LLM integration", "Prompt engineering", "Context management", "OpenAI API"] },
  { name: "Tools", items: ["Git", "Jest", "Figma", "Vercel"] },
] satisfies ContentInput["skills"];

/** Services, one line each (BRIEF.md §8, confirmed by the owner 2026-11-21). */
export const services = [
  { title: "Product web apps", line: "Dashboards, real-time features, from idea to launch" },
  { title: "Fast marketing sites", line: "Next.js sites built to load instantly and convert" },
  { title: "AI features", line: "Adding LLM-powered workflows to existing products" },
] satisfies ContentInput["services"];
