# Architecture

Outline only. Each section is filled in by the item that builds it.

## 1. Architecture

### DOM first
Every page is server-rendered HTML inside one shell (`src/components/layout/site-shell.tsx`, used by the root layout): skip link → sticky header (name, persistent navigation, "Simple view" switch) → the one `main` landmark (`id="main"`) → footer (email, GitHub, LinkedIn, copyright). Text and controls live only in the DOM, styled with the design tokens in `src/app/globals.css`. The canvas (PF-007) will sit behind this layer. The client components are the navigation (mobile menu), the switch and the contact flow (PF-019, below). Below `lg` the header keeps the `quick` links (Work, Resume) next to the menu button, so they are one tap away on every page (BRIEF §2); the other links sit behind the menu. Without JavaScript the navigation is shown as a plain list (`noscript:` = `@media (scripting: none)`) and the switch is hidden. All text comes from the content model (below).

### Routes (PF-006, BRIEF §5)
All are prerendered at build (Cache Components on) and readable with JavaScript off. None needs WebGL.

| Route | File | What |
|---|---|---|
| `/` | `src/app/page.tsx` | The journey's content as designed static sections, in chapter order (BRIEF §3, D-24): Hero `#top`, About `#about`, Experience `#experience`, Projects `#work` (the featured projects, each linking to its case study), Skills `#skills`, Services and Contact `#contact`. Sections live in `src/components/sections/`; each is tagged `data-chapter="<chapter>"`. This is what the static tier shows; the 3D journey draws behind the same DOM. |
| `/work` | `src/app/work/page.tsx` | Every project, featured first, then "More projects", each with role and stack |
| `/work/<slug>` | `src/app/work/[slug]/page.tsx` | Case study: role, org and year, stack, links, image, then Problem, Approach and Outcome; previous and next project. `generateStaticParams` returns every project. `ensureStatic = "navigation"` keeps the route fully static, and makes an unknown slug render completely before anything is sent, so `notFound()` answers 404 rather than streaming a 200 fallback shell. |
| `/resume` | `src/app/resume/page.tsx` | Experience, education, skills; download of `public/resume/swapnil-raj-resume.pdf` (the owner's own PDF, D-27) |
| 404 | `src/app/not-found.tsx` | Styled page inside the shell, with Home, Work and Resume |
| `/contact/result/<status>` | `src/app/contact/result/[status]/page.tsx` | Result pages of the contact form without JavaScript (PF-019): `sent`, `invalid`, `rate-limited`, `failed`; prerendered, any other status is a 404 |
| `POST /api/contact` | `src/app/api/contact/route.ts` | Contact delivery (PF-019), see "Contact flow and delivery" below. The only dynamic route |

Each page takes its title and description from the content (`site.meta`, or the project's `name` and `oneLine`), through the root layout's `titleTemplate`. No child segment sets `robots`, so the launch switch stays in charge. Images use `next/image` with `sizes` per layout (measured, in `src/components/projects/image-sizes.ts`, so phones fetch the smallest sharp file) and the intrinsic `width`/`height` from the content, so no layout shift. Formats: AVIF, else WebP, quality 75 (`next.config.ts`). The first image on `/work` and the case-study image load eagerly at high priority; the rest are lazy. All three fonts stay preloaded: each is on every page's first screen, and dropping the preloads (tested in PF-006) brought no LCP gain and a small font-swap layout shift (CLS 0.003–0.004).

**Lighthouse and `/work`.** On phones the LCP of `/work` is the first card's screenshot. Lighthouse's simulated throttling (Lantern) counts every script that ran before an image LCP as blocking it, so the simulated LCP there is about the time to download and run the shell's JavaScript on slow 4G (≈ 3.1–3.4 s), even though the image paints together with the first paint. With applied throttling (`--throttling-method=devtools`: real slow 4G and 4× CPU) the same page measures ≈ 2.0–2.4 s. Text-LCP routes (`/`, case studies) are not affected (≈ 0.77 s simulated).

### One persistent canvas
_To be filled in._

### Native scroll
_To be filled in._

### One source of truth for progress
_To be filled in._

### Chapters are modules
_To be filled in._

### Content is typed data
`src/content/` (PF-006). The data files in `src/content/data/` hold every word from BRIEF §8: identity and about, experience, education, skills, services, projects, contact-flow options, plus site frame and interface labels. `src/content/schema.ts` defines each shape with zod: strict objects, BRIEF limits, https links, `YYYY-MM` dates, and featured projects needing an outcome. `src/content/index.ts` parses everything once when first imported and exports typed values (`identity`, `projects`, `featuredProjects`, `getProject()`, `getHomeSection()` …).

Because every page imports it while `next build` prerenders, invalid content fails the build with a message naming the field (`ContentError`, `src/content/validate.ts`). `next.config.ts` is a function of the build phase; during `next build` and `next dev` it also runs `checkContentFiles()` (`src/content/check-files.ts`), which fails the build if a media file or the resume PDF is missing or an image's pixel size differs from the data. Content is server-only: client components get what they need as props (the nav receives `site.nav`), so zod never reaches the browser bundle.

The home sections, `/work`, the case studies and `/resume` read the same data; the journey chapters will too. How to add a project or replace an image: [content.md](content.md).

### Contact flow and delivery (PF-019)
The contact flow "Transmission" (BRIEF §6) sits in `#contact` on the home page: intent → only the detail questions that fit the intent (none for "Just saying hello") → name and email → the pre-drafted, editable message → review → Transmit. Progress is counted in stages (intent, details, you, message, review: five at most, four without details); the detail questions share the details stage and show "Question 2 of 3". The direct email link stays below the flow, so the flow is never the only way.

**One real form.** `src/components/contact/transmission.tsx` (client) renders every question inside one `<form action="/api/contact" method="post">`: options are `Chip` radios in a `fieldset` whose `legend` holds the question as an `h4`; text fields have `label`s. With JavaScript only the current step is shown (the others are `display: none`, so they are out of the tab order and the accessibility tree); without it (`noscript:`) every question is on the page, the detail questions grouped under "If you chose …", and the form posts like any form. The ₹ / $ budget toggle is a radio pair; each budget option carries its label in both currencies and a CSS rule in `globals.css` shows the one for the checked currency, so it works without JavaScript too.

**Step logic** is pure (`src/lib/contact/flow.ts`, unit-tested): a reducer over `{ answers, index, errors, nav, pending … }`. Next/Enter validates the step and moves on; Back always works and keeps every answer (it is not rendered on the first question – nothing to go back to – so Tab goes from the options straight to Next); a single choice made by click, tap, Space or a number key (1–9 pick the n-th option) moves on by itself after 1.2 s, cancelled by "Stay here", Escape or another pick; arrow keys move through a radio group without moving on. The message is drafted from the intent's `draft` template (content) when the visitor reaches it – each picked option as it reads in a sentence (`draftWording`: its `draftLabel`, else the label with the first letter lower-cased, e.g. "a full-time role (remote)") – and redrafted after changed answers unless the visitor edited it. Answers and the step are kept in `sessionStorage` (`transmission`, this tab only, every access in try/catch) and restored after a refresh; cleared after a successful send.

**Accessibility.** After each step change focus moves to the new question's heading and a polite live region reads "Step 2 of 5: Kind of role" (and the auto-advance notice, and "Transmitting…"). Errors are specific, inline, linked with `aria-describedby` and `aria-invalid`, and focus moves to the first field with an error. Send failures are a `role="alert"` block with the reason, "Try again" and the direct email link (the message prefilled in the `mailto:`). Reduced motion: the step slide (`animate-step-in` / `animate-step-back`) stops with every other animation. `e2e/contact.spec.ts` runs axe-core (`@axe-core/playwright`, WCAG 2.1 A/AA rules, helper `e2e/axe.ts`) on every step of one keyboard run per intent, the success and failure states, inline errors, the plain form and its result pages, desktop and phone, and requires zero violations. axe cannot run with JavaScript off (it needs the page's timers), so the plain form is scanned in a copy with every `<script>` removed and the stylesheet's `(scripting: none)` rules turned on, after the test proves the copy's accessibility tree equals the real JavaScript-off page's.

**Success** replaces the form with a confirmation (focused heading) and fires one `CustomEvent("transmission:sent", { detail: { intent } })` on `window` per send – PF-018 turns it into the uplink spire's pulse.

**Delivery** (`src/lib/contact/handler.ts`, wired in `src/app/api/contact/route.ts`). Checks, in this order: same origin (a browser `Origin` from another site → 403) → rate limit (429 with `Retry-After`) → body ≤ 32 KB (413) → trap field `website` must be empty (400) → minimum time: the script sends `elapsed` (ms since the flow became interactive); under 3 s → 400 `too-fast` → the same validation again (`readSubmission`, zod; 422 naming the fields) → no API key → 503 → send through Resend → provider error 502. Every refusal carries a fixed, safe message from `ui.transmission`; provider details stay in the server log, the key nowhere. Callers asking for JSON (the flow) get `{ ok, error, message, fields? }` with that status; the plain form gets a 303 redirect to `/contact/result/<status>`. Nothing is stored. The server logs one line per send with Resend's message id (no visitor data).

The email: to the public address in `identity.email`, from `CONTACT_EMAIL_FROM` or Resend's test sender `Portfolio <onboarding@resend.dev>` (until the domain is verified, D-33), reply-to the visitor, subject `[Portfolio] <intent> – <name>`, plain text and a simple HTML version (everything the visitor typed escaped) with intent, each detail, name, email, time (IST and UTC) and message. Labels in `ui.transmissionEmail`. Settings in `src/config/contact.ts`; env names in `.env.example`.

**Validation, twice, one set of rules.** The browser checks each step with small hand-written rules (`src/lib/contact/checks.ts`: name 1–100 characters on one line, an email address by zod's own pattern ≤ 254, message ≤ 2,000) to keep zod out of the client bundle (it cost ≈ 15 KB gzip); the endpoint runs the same rules as zod schemas (`src/lib/contact/submission.ts`, server only). `submission.test.ts` proves both give the same verdict on a table of inputs.

**Limits of the spam protection (best-effort, D-33).** No third-party captcha, no extra account.

- Rate limit: 5 submissions per client IP in any 10 minutes, counted **in memory per server instance**. On Vercel every serverless instance counts on its own and a cold start forgets the counts, so the real limit can be several times higher during a burst. The IP comes from `x-real-ip` / `x-forwarded-for`, which Vercel sets; on other hosts these headers can be forged. If spam gets through, a shared store (Upstash Redis) is the next step – a new account, so an owner decision.
- Minimum time: measured by the flow's script, so it only applies to JavaScript submissions. The plain form (no JavaScript) cannot measure time and sends no value; it is covered by the trap field and the rate limit only. A bot that posts the plain form directly skips the timer. **Accepted by the owner (2026-11-23):** this gap stays; the trap field and the rate limit cover the plain form.
- Trap field: catches bots that fill every field; not bots that read the page's CSS or accessibility tree.

## 2. Quality tiers and fallbacks

### Tiers: high, medium, low, static
_To be filled in._

### Choosing and lowering the tier
_To be filled in._

### "Simple view" switch
A toggle button (`aria-pressed`) in the navigation: `src/components/layout/simple-view-switch.tsx`. The choice lives in a tiny store with no React dependency, `src/lib/simple-view.ts` (`getSimpleView`, `setSimpleView`, `subscribeSimpleView`), remembered in `localStorage` under `simple-view` (`"on"`/`"off"`); every storage access is in try/catch, so a throwing storage keeps the choice for the visit only. Other tabs follow through the `storage` event. React reads it with `useSimpleView()` (`src/lib/use-simple-view.ts`, `false` on the server and during hydration). PF-007 makes "on" select the static tier.

### Reduced motion
_To be filled in._

### Per-chapter tier behaviour
_To be filled in._
