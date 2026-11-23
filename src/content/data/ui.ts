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
} as const;

export type Ui = typeof ui;
