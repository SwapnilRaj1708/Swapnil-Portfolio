import type { ContentInput } from "../schema";

/**
 * Options of the "Transmission" contact flow (BRIEF.md §6; options confirmed by the owner in §8,
 * 2026-11-21). The flow itself is src/components/contact/ (PF-019); its interface words are in
 * ui.ts (`transmission`).
 *
 * `draft` (PF-019): the message pre-drafted from the visitor's choices, editable before sending.
 * `{<question id>}` is replaced by the option picked for that question (the budget in the chosen
 * currency) as it reads in a sentence: its label with the first letter lower-cased ("Full-time" →
 * "full-time"; amounts such as "₹50k–2L" stay as they are), or its `draftLabel` where that does
 * not fit – an article ("a website") or an acronym ("ASAP", "an AI feature").
 */
export const contactFlow = {
  intentQuestion: "What brings you here?",
  intents: [
    {
      id: "hiring",
      label: "Hiring for a role",
      draft: "Hi Swapnil, I'm hiring for a {role} role ({work-mode}) and would like to talk.",
      details: [
        {
          id: "role",
          label: "Kind of role",
          options: [
            { id: "full-time", label: "Full-time" },
            { id: "contract", label: "Contract" },
            { id: "contract-to-hire", label: "Contract-to-hire" },
          ],
        },
        {
          id: "work-mode",
          label: "Work mode",
          options: [
            { id: "remote", label: "Remote" },
            { id: "hybrid", label: "Hybrid" },
            { id: "on-site", label: "On-site" },
          ],
        },
      ],
    },
    {
      id: "freelance",
      label: "A freelance project",
      draft: "Hi Swapnil, I have a freelance project in mind: {project}. Budget: {budget}. Timeline: {timeline}.",
      details: [
        {
          id: "project",
          label: "Kind of project",
          options: [
            { id: "website", label: "Website", draftLabel: "a website" },
            { id: "web-app", label: "Web app", draftLabel: "a web app" },
            { id: "ai-feature", label: "AI feature", draftLabel: "an AI feature" },
            { id: "something-else", label: "Something else" },
          ],
        },
        {
          id: "budget",
          label: "Budget range",
          currencies: [
            {
              id: "inr",
              symbol: "₹",
              default: true,
              options: [
                { id: "small", label: "under ₹50k" },
                { id: "medium", label: "₹50k–2L" },
                { id: "large", label: "₹2L+" },
                { id: "not-sure", label: "Not sure yet" },
              ],
            },
            {
              id: "usd",
              symbol: "$",
              default: false,
              options: [
                { id: "small", label: "under $600" },
                { id: "medium", label: "$600–2,400" },
                { id: "large", label: "$2,400+" },
                { id: "not-sure", label: "Not sure yet" },
              ],
            },
          ],
        },
        {
          id: "timeline",
          label: "Timeline",
          options: [
            { id: "asap", label: "ASAP", draftLabel: "ASAP" },
            { id: "1-2-months", label: "1–2 months" },
            { id: "flexible", label: "Flexible" },
          ],
        },
      ],
    },
    {
      id: "collaboration",
      label: "A collaboration",
      draft: "Hi Swapnil, I'd like to talk about a collaboration ({kind}).",
      details: [
        {
          id: "kind",
          label: "Kind of collaboration",
          options: [
            { id: "open-source", label: "Open source" },
            { id: "side-project", label: "Side project" },
            { id: "talk-or-content", label: "Talk or content" },
            { id: "other", label: "Other" },
          ],
        },
      ],
    },
    // "Just saying hello" skips the details step.
    { id: "hello", label: "Just saying hello", draft: "Hi Swapnil, just saying hello.", details: [] },
  ],
  fields: ["name", "email", "message"],
} satisfies ContentInput["contactFlow"];
