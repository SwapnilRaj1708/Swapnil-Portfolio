/**
 * Content schemas (zod). Every piece of copy on the site is typed data validated against these
 * shapes; src/content/index.ts parses the data files with them when the site is built, so missing
 * or invalid content stops the build with a readable message (STANDARDS.md §1: content is typed
 * data, validated at build).
 *
 * The data itself lives in src/content/data/ and comes from BRIEF.md §8 only – nothing invented.
 * Strict objects: an unknown or misspelt key is an error, not silently ignored.
 */
import { z } from "zod";

/** Non-empty, trimmed text. */
const text = z
  .string()
  .trim()
  .min(1, { error: "must not be empty" });

/** https:// address (every outbound link on the site). */
const httpsUrl = z.url({ protocol: /^https$/, error: "must be an https:// URL" });

/** Same-site path, e.g. "/work" or "/#about". */
const sitePath = z.string().regex(/^\/[^\s]*$/, { error: 'must be a same-site path starting with "/"' });

/** Year and month, e.g. "2025-04" – shown as "Apr 2025". */
const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'must be "YYYY-MM"' });

/** URL-safe identifier, e.g. "softboard-lite". */
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  error: "must be lower-case letters, digits and single hyphens",
});

// ---------------------------------------------------------------------------------------------
// Identity, about

export const linkSchema = z.strictObject({
  label: text,
  href: httpsUrl,
});

export const identitySchema = z.strictObject({
  name: text,
  role: text,
  /** One line, 12 words at most (BRIEF.md §8). */
  pitch: text.refine((s) => s.split(/\s+/).length <= 12, { error: "must be 12 words or fewer" }),
  location: text,
  timeZone: text,
  /** Shown in the status chip. */
  availability: text,
  /** Public (owner, 2026-11-21): footer and the contact section. */
  email: z.email({ error: "must be an email address" }),
  links: z.strictObject({
    github: linkSchema,
    linkedin: linkSchema,
  }),
});

export const aboutSchema = z.strictObject({
  /** Two or three beats, 120 words at most in all (BRIEF.md §8). */
  beats: z
    .array(text)
    .min(2, { error: "needs two or three beats" })
    .max(3, { error: "needs two or three beats" })
    .refine((beats) => beats.join(" ").split(/\s+/).length <= 120, { error: "must be 120 words or fewer in all" }),
  /** The owner will revise the text (BRIEF.md §8). Not shown; kept so it is not forgotten. */
  provisional: z.boolean(),
});

// ---------------------------------------------------------------------------------------------
// Experience, education, skills, services

export const roleSchema = z
  .strictObject({
    company: text,
    title: text,
    location: text,
    start: yearMonth,
    /** null = to the present. */
    end: yearMonth.nullable(),
    outcomes: z.array(text).min(2, { error: "needs two to four outcomes" }).max(4, { error: "needs two to four outcomes" }),
  })
  .refine((r) => r.end === null || r.end >= r.start, { error: "end must not be before start", path: ["end"] });

export const educationSchema = z
  .strictObject({
    degree: text,
    institution: text,
    location: text,
    start: yearMonth,
    end: yearMonth,
  })
  .refine((e) => e.end >= e.start, { error: "end must not be before start", path: ["end"] });

export const skillGroupSchema = z.strictObject({
  name: text,
  /** Six at most per group; no levels or percentages (BRIEF.md §8). */
  items: z.array(text).min(1, { error: "needs at least one entry" }).max(6, { error: "six entries at most" }),
});

export const serviceSchema = z.strictObject({
  title: text,
  line: text,
});

// ---------------------------------------------------------------------------------------------
// Projects

export const mediaSchema = z
  .strictObject({
    /** Path under public/, e.g. "/media/projects/twizzr/home.webp". */
    src: z.string().regex(/^\/media\/projects\/[a-z0-9-]+\/[a-z0-9-]+\.(webp|avif|jpg|png)$/, {
      error: 'must be a file under "/media/projects/<slug>/" (webp, avif, jpg or png)',
    }),
    alt: text,
    /** Intrinsic size in pixels – reserves the space before the image loads (no layout shift). */
    width: z.int().positive(),
    height: z.int().positive(),
    /** A stand-in until the owner's media arrives (PF-006 note). */
    provisional: z.boolean(),
    /** Where the file came from, e.g. "live-site screenshot, 2026-11-23". */
    source: text,
  });

export const projectSchema = z
  .strictObject({
    slug,
    name: text,
    /** One sentence; also the case study's meta description. */
    oneLine: text,
    /** Who it was for: employer, client relationship or "Personal". */
    org: text,
    /** Free form ("2025–2026", "March 2026"); optional – not shown when absent. */
    year: text.optional(),
    /** The owner's role. */
    role: text,
    stack: z.array(text).min(1, { error: "needs at least one entry" }),
    /** What the project is and who it serves. */
    problem: text,
    /** What the owner did – restates BRIEF.md §8 only. */
    approach: z.array(text).min(1, { error: "needs at least one step" }),
    /** Results; optional only where BRIEF.md §8 gives none (then the section is not shown). */
    outcome: z.array(text).min(1, { error: "needs at least one result, or leave the field out" }).optional(),
    links: z.strictObject({
      live: httpsUrl,
      code: httpsUrl.optional(),
    }),
    media: z.array(mediaSchema),
    /**
     * The live site has no public screen to show, and why. "behind-sign-in": it opens on a sign-in.
     * Only for a project without media; its readout tile then carries the matching label.
     */
    noPublicPreview: z.enum(["behind-sign-in"]).optional(),
    featured: z.boolean(),
    /** Position: featured projects first (1, 2, 3 …), then the rest. */
    order: z.int().positive(),
  })
  .refine((p) => !p.featured || p.outcome !== undefined, {
    error: "a featured project must state an outcome",
    path: ["outcome"],
  })
  .refine((p) => p.media.every((m) => m.src.startsWith(`/media/projects/${p.slug}/`)), {
    error: "media files must live in the project's own folder /media/projects/<slug>/",
    path: ["media"],
  })
  .refine((p) => p.noPublicPreview === undefined || p.media.length === 0, {
    error: "a project with media has a preview: remove noPublicPreview or the media",
    path: ["noPublicPreview"],
  });

export const projectsSchema = z
  .array(projectSchema)
  .min(1)
  .superRefine((projects, ctx) => {
    const seen = new Set<string>();
    const orders = new Set<number>();
    projects.forEach((p, i) => {
      if (seen.has(p.slug)) ctx.addIssue({ code: "custom", message: `duplicate slug "${p.slug}"`, path: [i, "slug"] });
      if (orders.has(p.order)) ctx.addIssue({ code: "custom", message: `duplicate order ${p.order}`, path: [i, "order"] });
      seen.add(p.slug);
      orders.add(p.order);
    });
    const featured = projects.filter((p) => p.featured).length;
    if (featured < 4 || featured > 6) {
      ctx.addIssue({ code: "custom", message: `4 to 6 featured projects (BRIEF.md §8), found ${featured}`, path: [] });
    }
    // Featured projects come first in the order.
    const maxFeatured = Math.max(...projects.filter((p) => p.featured).map((p) => p.order));
    const minOther = Math.min(...projects.filter((p) => !p.featured).map((p) => p.order));
    if (maxFeatured > minOther) {
      ctx.addIssue({ code: "custom", message: "featured projects must come before the others in `order`", path: [] });
    }
  });

// ---------------------------------------------------------------------------------------------
// Contact flow options (BRIEF.md §6 and §8) – the flow is src/components/contact/ (PF-019).

const optionSchema = z
  .strictObject({
    id: slug,
    label: text,
    /**
     * How the option reads inside a drafted message (PF-019), where the default – the label with
     * its first letter lower-cased ("Full-time" → "full-time") – does not fit: an article
     * ("a website"), an acronym ("ASAP", "an AI feature"), other wording.
     */
    draftLabel: text.optional(),
  })
  .refine((o) => o.draftLabel !== undefined || !/^\p{Lu}{2}/u.test(o.label), {
    error: "draftLabel: a label that starts with capitals (an acronym) needs its wording for the drafted message",
    path: ["draftLabel"],
  });

export const detailQuestionSchema = z.strictObject({
  id: slug,
  /** What is asked, e.g. "Kind of role". */
  label: text,
  /** Options in one currency, or per currency (budget: ₹ by default, $ toggle). */
  options: z.array(optionSchema).min(2).optional(),
  currencies: z
    .array(
      z.strictObject({
        id: z.enum(["inr", "usd"]),
        symbol: text,
        default: z.boolean(),
        options: z.array(optionSchema).min(2),
      }),
    )
    .min(2)
    .optional(),
}).refine((q) => (q.options === undefined) !== (q.currencies === undefined), {
  error: "give either options or currencies",
});

export const contactFlowSchema = z.strictObject({
  intentQuestion: text,
  intents: z
    .array(
      z
        .strictObject({
          id: slug,
          label: text,
          /**
           * The pre-drafted message (PF-019). `{<question id>}` is replaced by the option picked
           * for that question as it reads in a sentence (its `draftLabel`, else its label with the
           * first letter lower-cased); every placeholder must name one of this intent's questions.
           */
          draft: text,
          /** Detail questions, one screen each; empty = the step is skipped ("Just saying hello"). */
          details: z.array(detailQuestionSchema),
        })
        .refine((intent) => [...intent.draft.matchAll(/\{([^}]*)\}/g)].every((m) => intent.details.some((d) => d.id === m[1])), {
          error: "draft: every {placeholder} must be the id of one of this intent's detail questions",
          path: ["draft"],
        }),
    )
    .min(2)
    .refine((intents) => new Set(intents.map((i) => i.id)).size === intents.length, { error: "intent ids must be unique" }),
  /** Typed fields after the details, in order. */
  fields: z.array(z.enum(["name", "email", "message"])).min(1),
});

// ---------------------------------------------------------------------------------------------
// Site: navigation, footer, page metadata, interface labels

export const navItemSchema = z.strictObject({
  label: text,
  href: sitePath,
  /** Kept in the header on phones too (not behind the menu): Work and Resume, one tap away. */
  quick: z.boolean().optional(),
});

const pageMetaSchema = z.strictObject({ title: text, description: text });

export const siteSchema = z.strictObject({
  /** Persistent navigation (BRIEF.md §5), in this order. */
  nav: z.array(navItemSchema).min(1),
  copyright: text,
  /** Resume PDF under public/ (D-27). */
  resumePdf: z.strictObject({
    href: z.string().regex(/^\/resume\/[a-z0-9-]+\.pdf$/, { error: 'must be a PDF under "/resume/"' }),
    fileName: text,
  }),
  meta: z.strictObject({
    home: pageMetaSchema,
    /** "%s" is replaced by the page title. */
    titleTemplate: text.refine((s) => s.includes("%s"), { error: 'must contain "%s"' }),
    work: pageMetaSchema,
    resume: pageMetaSchema,
    notFound: pageMetaSchema,
  }),
});

/** The journey's chapters with a home section (BRIEF.md §3). */
export const chapterSchema = z.enum(["port", "bus", "memory", "array", "core", "uplink"]);

/** Section of the home page = one journey chapter (BRIEF.md §3, order D-24). */
export const homeSectionSchema = z.strictObject({
  chapter: chapterSchema,
  /** The element id the navigation links to (BRIEF.md §3). */
  sectionId: slug,
  /** Chapter number shown in the index label ("02 / ABOUT"). */
  index: z.int().positive(),
  label: text,
  heading: text,
});

// ---------------------------------------------------------------------------------------------
// Stills (PF-028): Blender renders that open the home sections (the static tier)

const stillFileSchema = z.strictObject({
  /** A WebP master under public/media/stills/, e.g. "/media/stills/still-s1-bus-wide.webp". */
  src: z.string().regex(/^\/media\/stills\/[a-z0-9-]+\.webp$/, { error: 'must be a WebP file under "/media/stills/"' }),
  /** Intrinsic size in pixels (checked against the file at build). */
  width: z.int().positive(),
  height: z.int().positive(),
});

export const stillSchema = z
  .strictObject({
    chapter: chapterSchema,
    /** Landscape crop: wide and landscape screens. */
    wide: stillFileSchema,
    /** Portrait crop: portrait and narrow screens. */
    portrait: stillFileSchema,
    /** Where the files came from. */
    source: text,
  })
  .refine((s) => s.wide.width > s.wide.height && s.portrait.width < s.portrait.height, {
    error: "the wide crop must be landscape and the portrait crop portrait",
  });

export const stillsSchema = z
  .array(stillSchema)
  .refine((stills) => chapterSchema.options.every((c) => stills.filter((s) => s.chapter === c).length === 1), {
    error: "needs exactly one still per chapter",
  });

export const socialImageSchema = z.strictObject({
  /** JPEG under public/media/stills/ (the social-image renderer reads PNG or JPEG, not WebP). */
  src: z.string().regex(/^\/media\/stills\/[a-z0-9-]+\.jpe?g$/, { error: 'must be a JPEG file under "/media/stills/"' }),
  width: z.literal(1200),
  height: z.literal(630),
  source: text,
});

/** Interface words (headings, button and link labels). Every value must be non-empty. */
export const uiSchema = z.record(z.string(), z.record(z.string(), text));

export const contentSchema = z.strictObject({
  identity: identitySchema,
  about: aboutSchema,
  experience: z.array(roleSchema).min(1),
  education: z.array(educationSchema).min(1),
  skills: z.array(skillGroupSchema).min(1).max(4, { error: "four groups at most (BRIEF.md §8)" }),
  services: z.array(serviceSchema).min(1).max(3, { error: "three at most (BRIEF.md §8)" }),
  projects: projectsSchema,
  contactFlow: contactFlowSchema,
  site: siteSchema,
  homeSections: z.array(homeSectionSchema).length(6),
  stills: stillsSchema,
  socialImage: socialImageSchema,
});

export type Identity = z.infer<typeof identitySchema>;
export type About = z.infer<typeof aboutSchema>;
export type Role = z.infer<typeof roleSchema>;
export type Education = z.infer<typeof educationSchema>;
export type SkillGroup = z.infer<typeof skillGroupSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type Media = z.infer<typeof mediaSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ContactFlow = z.infer<typeof contactFlowSchema>;
export type ContactIntent = ContactFlow["intents"][number];
export type DetailQuestion = z.infer<typeof detailQuestionSchema>;
export type NavItem = z.infer<typeof navItemSchema>;
export type Site = z.infer<typeof siteSchema>;
export type HomeSection = z.infer<typeof homeSectionSchema>;
export type Chapter = z.infer<typeof chapterSchema>;
export type Still = z.infer<typeof stillSchema>;
export type StillFile = Still["wide"];
export type SocialImage = z.infer<typeof socialImageSchema>;
export type Content = z.infer<typeof contentSchema>;
/** What a data file must provide before parsing (inputs may omit defaults). */
export type ContentInput = z.input<typeof contentSchema>;
