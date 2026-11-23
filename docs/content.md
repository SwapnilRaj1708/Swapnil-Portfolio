# Content

Every word about the owner lives in typed data under `src/content/data/`, checked against zod schemas when the site is built. Pages and components only display it, so editing content never touches components or 3D code.

**Source rule.** All facts come from `BRIEF.md` §8 in the planning repo, approved by the owner. Nothing is invented or embellished. If §8 says "later", leave the optional field out: it is simply not shown, and no placeholder text is used. Twizzr is always "hyperlocal commerce". The phone number appears only inside the resume PDF (D-27), never in any data file, page, doc or commit.

## Files

| File | Holds | Shown on |
|---|---|---|
| `src/content/data/identity.ts` | `identity`: name, role, pitch (≤ 12 words), location, time zone, availability, email, GitHub and LinkedIn · `about`: two or three beats (≤ 120 words, provisional) | hero, header, footer, About, Contact, `/resume` |
| `src/content/data/career.ts` | `experience` (roles, newest first) · `education` · `skills` (≤ 4 groups of ≤ 6) · `services` (≤ 3) | Experience, Skills and Contact sections on `/`; `/resume` |
| `src/content/data/projects.ts` | `projects`: every project, featured first | `/` (featured), `/work`, `/work/<slug>` |
| `src/content/data/contact-flow.ts` | options of the contact flow (BRIEF §6) | PF-019 (not shown yet) |
| `src/content/data/site.ts` | `site`: navigation, copyright, resume PDF path, page titles and descriptions · `homeSections`: chapter → section id, index label, heading | every page |
| `src/content/data/ui.ts` | interface words: headings, button and link labels (no facts about the owner) | every page |
| `src/content/schema.ts` | the zod schemas: what each field must be | – |
| `src/content/index.ts` | parses everything once and exports it (`identity`, `projects`, `featuredProjects`, `getProject()` …) | – |

## What checks the content

- **Schema** (`src/content/schema.ts`): runs when anything imports `@/content`. This means `next build` (prerendering every page), `next dev`, and the unit tests. A missing field, a wrong type, an unknown or misspelt key, an empty string, an `http://` link, a bad date, or a BRIEF limit (pitch words, skill groups, services, 4–6 featured projects, featured before the rest, unique slugs) stops the build with a message such as:

  ```text
  Invalid content (src/content/data/):
  ✖ Invalid input: expected string, received undefined
    → at projects[0].role
  ```

- **Files** (`src/content/check-files.ts`, called by `next.config.ts` during `next build` and `next dev`): every `media[].src` and the resume PDF must exist in `public/`, and a WebP's real pixel size must equal its `width` × `height`.
- **Content rules** (`src/content/content-rules.test.ts`): Twizzr's banned framing (BRIEF §8; the test builds the pattern, so even docs cannot contain the phrase) appears nowhere, and no phone-number pattern appears anywhere in `src/`, `public/` (the PDF is not scanned), `docs/`, `scripts/` or `e2e/`.

## Add a project

1. Add an entry to `src/content/data/projects.ts` (copy an existing one). The fields:

   | Field | Required | What it is | Where it shows |
   |---|---|---|---|
   | `slug` | yes | URL id, lower-case and hyphens: `my-project` → `/work/my-project` | URL, media folder |
   | `name` | yes | project name | card heading, case-study h1, page title |
   | `oneLine` | yes | one sentence | card, case-study intro, meta description |
   | `org` | yes | employer, "Freelance" or "Personal" | card label, case study "For" |
   | `year` | no | free form: "2025–2026", "March 2026" | card label, case study |
   | `role` | yes | the owner's role | `/work` card, case study "Role" |
   | `stack` | yes | list of technologies | cards, case study "Stack" |
   | `problem` | yes | what the project is and for whom | case study "Problem" |
   | `approach` | yes | what the owner did, as a list (only what §8 says) | case study "Approach" |
   | `outcome` | featured: yes; others: no | results, with numbers where §8 gives them | case study "Outcome" (left out when absent) |
   | `links.live` | yes | https link to the live site | case study "Live site" |
   | `links.code` | no | https link to the code | case study "Code" |
   | `media` | yes (may be `[]`) | images, see below; the first one is the card and case-study image. Without media, a readout tile (project name over a trace line) stands in | cards, case study |
   | `noPublicPreview` | no | `"behind-sign-in"` when the live site opens on a sign-in (only with `media: []`) | readout tile label "PREVIEW · BEHIND SIGN-IN" (words in `ui.projects.previewBehindSignIn`) |
   | `featured` | yes | `true` = on the home page and in the journey | `/`, `/work` group |
   | `order` | yes | position, 1, 2, 3 …; featured projects take the lowest numbers | everywhere |

2. Run `npm test` (schema, file and content checks), then `npm run build`. The new case study is generated automatically (`generateStaticParams` reads the data).

No component, route or 3D code changes. The journey's display slabs (chapter `array`, PF-015) are meant to read the same `featuredProjects`.

## Images

Each image is a `media` entry: `src` (a file under `public/media/projects/<slug>/`), `alt` (what the image shows, factually), `width` and `height` in pixels (reserve the space, so nothing shifts), `provisional` and `source`. Pages draw it with `next/image`, which resizes it per device and serves AVIF (WebP where the browser has no AVIF) at quality 75; how wide each image is drawn is in `src/components/projects/image-sizes.ts`. Every screen sits in the display frame (dark bezel, thin border, a fixed 16:10 screen filled from the top, `object-fit: cover`), so any image size fits; in cards it rests slightly dimmed (token `--screen-dim`) and lifts to full brightness on hover or keyboard focus of the card – only on devices that can hover; on touch screens it is always at full brightness. On a case study the bezel is `surface` and the screenshot is never dimmed; a case study without media shows its readout tile as a short band (token `--spacing-readout-band`, 240 px on desktop) instead of a full 16:10 screen.

**Stand-ins (now).** Until the owner's media arrives, `npm run media:capture -- [slug…]` photographs each project's live homepage. It uses Playwright's full Chromium at desktop 1440×900, first screen only, with no login, no typing and no accepting of cookies (only a notice's close button may be clicked). It writes `public/media/projects/<slug>/home.webp` at ≤ 250 KB and prints the `media` entry to paste. A site that redirects to a sign-in page, shows a login form or a sign-in-only screen, is blank, or fails to load is skipped and reported. Entries it produces carry `provisional: true` and `source: "live-site screenshot, <date>"`. The script never touches a project whose media is not provisional.

**Replace a provisional image with the owner's own.**

1. Export the image (WebP preferred; ≤ 2048 px on the long side; keep it light, since a fast-lane page must stay ≤ 1 MB in total).
2. Put it in `public/media/projects/<slug>/` (any lower-case file name, e.g. `dashboard.webp`). Delete the stand-in file if it is no longer used.
3. Update the entry: `src`, `alt`, the real `width` and `height`, `provisional: false`, and `source` (e.g. "owner, 2026-12-01").
4. `npm test` and `npm run build` check that the file exists and the size matches. Add a line to `docs/assets.md` if the asset list asks for it.

## Edit other content

- **Text** (pitch, about, roles, skills, services): edit the data file; the schema enforces the BRIEF limits.
- **Navigation:** `site.nav`, in order. `quick: true` keeps a link in the header on phones (Work and Resume: one tap away from every page, BRIEF §2).
- **Page titles and descriptions:** `site.meta` (home, `/work`, `/resume`, 404). A case study uses its `name` and `oneLine`. `titleTemplate` adds " – Swapnil Raj".
- **Home sections:** `homeSections` maps each journey chapter to its section id (`#top`, `#about`, `#experience`, `#work`, `#skills`, `#contact`, BRIEF §3) and its index label. The order of the sections themselves is in `src/app/page.tsx` (D-24).
- **Resume PDF:** the owner's file is copied byte for byte from the assets folder (`Blender Assets/content/Swapnil Raj Resume.pdf`) to `public/resume/swapnil-raj-resume.pdf`. To update it, copy the new file over the old one. Never edit it in place.
- **Interface words:** `src/content/data/ui.ts`.
