import type { ContentInput } from "../schema";

/** Who the site is about (BRIEF.md §8). Shown in the hero, header, footer, resume and contact. */
export const identity = {
  name: "Swapnil Raj",
  role: "Full-Stack Engineer",
  pitch: "I build fast, real-time web products that people actually use.",
  location: "Lucknow, India",
  timeZone: "IST (UTC+5:30)",
  availability: "Open to full-time roles and freelance projects",
  email: "raj.swapnil1708@gmail.com",
  links: {
    github: { label: "GitHub", href: "https://github.com/SwapnilRaj1708" },
    linkedin: { label: "LinkedIn", href: "https://www.linkedin.com/in/swapnilraj1708" },
  },
} satisfies ContentInput["identity"];

/** About, in three beats (BRIEF.md §8 – provisional, the owner will revise it). */
export const about = {
  beats: [
    "I'm Swapnil, a full-stack engineer in Lucknow. I build web products that make complicated work feel simple, and keep working when real people lean on them.",
    "At EL Nova Labs I led the frontend of Twizzr, a hyperlocal commerce platform for residential societies: real-time ordering, a parallel multi-cart system, and merchant tools that cut onboarding time by 40%. Before that, I built EngineerHUB's platform from scratch: job portal, dashboards and real-time chat.",
    "I like the problems underneath the UI: state, data flow and real-time behaviour. I'm looking for a team where I can own features end to end.",
  ],
  provisional: true,
} satisfies ContentInput["about"];
