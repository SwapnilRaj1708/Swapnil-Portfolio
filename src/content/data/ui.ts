import { errorCopy } from "./error-copy";

/**
 * Interface words: headings, labels, link and button text. No facts about the owner here –
 * those live in the other data files. Every value must be non-empty (checked at build).
 */
export const ui = {
  hero: {
    workCta: "See the work",
    resumeCta: "Resume",
    locationLabel: "Based in",
  },
  /** Facts readout beside the About text (D-38): row labels only, the values come from the content. */
  about: {
    roleLabel: "Role",
    basedInLabel: "Based in",
    statusLabel: "Status",
    coreStackLabel: "Core stack",
  },
  projects: {
    caseStudy: "Read the case study",
    allWork: "All projects",
    roleLabel: "Role",
    stackLabel: "Stack",
    /** Readout tile of a project marked `noPublicPreview: "behind-sign-in"` (shown upper-case). */
    previewBehindSignIn: "Preview · behind sign-in",
  },
  work: {
    heading: "Work",
    intro: "Every project with my role and the stack. Featured work first.",
    featuredHeading: "Featured",
    moreHeading: "More projects",
  },
  caseStudy: {
    backToWork: "All work",
    roleLabel: "Role",
    orgLabel: "For",
    yearLabel: "Year",
    stackLabel: "Stack",
    linksLabel: "Links",
    liveLink: "Live site",
    codeLink: "Code",
    problemHeading: "Problem",
    approachHeading: "Approach",
    outcomeHeading: "Outcome",
    mediaHeading: "Screens",
    nextLabel: "Next project",
    previousLabel: "Previous project",
    projectNav: "Other projects",
  },
  experience: {
    present: "Present",
  },
  contact: {
    servicesHeading: "Services",
    contactHeading: "Get in touch",
    emailLabel: "Email",
    profilesLabel: "Elsewhere",
    timeZoneLabel: "Time zone",
  },
  /**
   * The contact flow "Transmission" (PF-019, BRIEF.md §6). `{name}`-style placeholders are filled
   * in by the flow. The questions and options themselves are in contact-flow.ts.
   */
  transmission: {
    label: "Transmission",
    progress: "Step {current} of {total}",
    questionProgress: "Question {current} of {total}",
    stepIntent: "Intent",
    stepDetails: "Details",
    stepContact: "You",
    stepMessage: "Message",
    stepReview: "Review",
    /** Read out after each step change (polite live region). */
    announceStep: "Step {current} of {total}: {question}",
    numberHint: "Tip: press a number key to pick an option.",
    currencyLegend: "Show amounts in",
    contactQuestion: "Where can I reply?",
    nameLabel: "Your name",
    emailLabel: "Your email",
    messageQuestion: "Your message",
    messageLabel: "Message (optional)",
    messageHint: "Drafted from your answers. Change anything you like.",
    reviewQuestion: "Ready to transmit?",
    reviewIntent: "About",
    reviewName: "Name",
    reviewEmail: "Email",
    reviewMessage: "Message",
    noMessage: "No message",
    privacy: "Your message is emailed to me and not stored on this site.",
    next: "Next",
    back: "Back",
    transmit: "Transmit",
    sending: "Transmitting…",
    autoAdvance: "Next question in a moment.",
    autoAdvanceUndo: "Stay here",
    /** Without JavaScript all questions are on one page; detail questions are grouped by intent. */
    noScriptDetailsFor: "If you chose “{intent}”",
    errorIntent: "Pick what brings you here.",
    errorPick: "Pick one option to continue.",
    errorName: "Enter your name.",
    errorNameLong: "Use 100 characters or fewer for your name.",
    errorEmail: "Enter an email address like name@example.com.",
    errorMessageLong: "Keep the message under 2,000 characters.",
    sentHeading: "Transmission received",
    sentBody: "Your message is on its way to my inbox. Replies go to {email}.",
    sendAnother: "Send another message",
    failedHeading: "Not sent yet",
    failedBody: "Something went wrong on my side and the message was not sent. Try again, or email me directly.",
    tooFastBody: "That was very quick. Wait a few seconds, then try again.",
    rateLimitedBody: "Too many messages from your connection just now. Wait a few minutes, or email me directly.",
    invalidBody: "Some answers are missing or not valid. Go back and check them, then try again.",
    retry: "Try again",
    emailInstead: "Email me directly",
    emailFallback: "Prefer plain email?",
    /** Label of the hidden trap field (never shown; only a bot reads it). */
    trapLabel: "Leave this field empty",
  },
  /** The email the owner receives (server side, PF-019). Placeholders filled in by the server. */
  transmissionEmail: {
    subject: "[Portfolio] {intent} – {name}",
    heading: "New message from the portfolio",
    intentLabel: "Intent",
    nameLabel: "Name",
    emailLabel: "Email",
    messageLabel: "Message",
    timeLabel: "Sent",
    notAnswered: "not answered",
    noMessage: "(no message)",
    footer: "Sent by the contact form on the portfolio. Reply to this email to answer {name} directly.",
  },
  /** Result pages of the plain form without JavaScript (/contact/result/<status>, PF-019). */
  contactResult: {
    kicker: "Transmission",
    sentTitle: "Message sent",
    sentBody: "Your message is on its way to my inbox. Replies go to the email address you gave.",
    invalidTitle: "Message not sent",
    invalidBody:
      "Some answers were missing or not valid: pick what brings you here, and enter your name and an email address like name@example.com. Your browser's Back button returns to the form with your answers.",
    rateLimitedTitle: "Message not sent",
    rateLimitedBody: "Too many messages from your connection just now. Wait a few minutes and try again, or email me directly.",
    failedTitle: "Message not sent",
    failedBody: "Something went wrong on my side and the message was not sent. Try again in a moment, or email me directly.",
    backToForm: "Back to the form",
    home: "Home",
    emailInstead: "Email me directly",
  },
  resume: {
    heading: "Resume",
    download: "Download the PDF",
    downloadNote: "PDF",
    experienceHeading: "Experience",
    educationHeading: "Education",
    skillsHeading: "Skills",
  },
  notFound: {
    heading: "Page not found",
    body: "There is no page at this address. It may have moved, or the link may be mistyped.",
    home: "Home",
    work: "Work",
    resume: "Resume",
    code: "404",
  },
  /** Error pages (error.tsx, global-error.tsx) – kept in error-copy.ts, see there. */
  error: errorCopy,
} as const;

export type Ui = typeof ui;
