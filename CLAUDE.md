# CLAUDE.md – working rules for this repo

Code for Swapnil Raj's portfolio ("Inside the Machine"): a scroll-driven journey through one continuous 3D scene, with plain fast-lane pages beside it.

**Source of truth.** This file condenses `STANDARDS.md` and `WORKFLOW.md` from the private planning folder (`Portfolio Orchestrator`, next to this repo). If this file and `STANDARDS.md` ever disagree, **`STANDARDS.md` wins**, and the next change prompt corrects this file.

**This repo is public** (D-23). Every push is visible at once and history cannot be taken back.

## Stack (exact installed versions)

| Tool | Version |
|---|---|
| Node.js | 24.19.0 (major pinned in `.nvmrc`) |
| npm | 11.17.0 |
| Next.js (`next`) | 16.4.6 – App Router, `src/` directory, Turbopack; `cacheComponents` and `partialPrefetching` on (scaffold defaults) |
| React / React DOM | 19.3.0 |
| TypeScript | 5.9.3 (`strict: true`) |
| Tailwind CSS | 4.3.3, via `@tailwindcss/turbopack` 4.3.3 (CSS-first config in `src/app/globals.css`; no PostCSS) |
| ESLint | 9.39.5 with `eslint-config-next` 16.4.6 (flat config, `eslint.config.mjs`) |
| `@types/node` / `@types/react` / `@types/react-dom` | 20.19.43 / 19.3.0 / 19.3.0 |
| Vitest (`vitest`) | 4.1.12 – with `jsdom` 31.0.1 and `@vitejs/plugin-react` 6.3.0 (Vite 8.3.8) |
| Testing Library | `@testing-library/react` 16.3.3, `@testing-library/jest-dom` 7.0.1, `@testing-library/user-event` 14.6.13 |
| Playwright (`@playwright/test`) | 1.65.1 – Chromium only |
| Lighthouse CI (`@lhci/cli`) | 0.16.1 (bundles Lighthouse 13.6.0) |
| `clsx` | 2.1.1 – class-name merging (runtime dependency) |
| `zod` | 4.6.7 – content schemas, validated at build (server only) |

Import alias: `@/*` → `src/*`.

Library interfaces change. Before using any library API, check the documentation of the **installed** version (for Next.js: `node_modules/next/dist/docs/`), never memory.

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Clean install from `package-lock.json` (use this to restore dependencies) |
| `npm run dev` | Development server (http://localhost:3000); `predev` runs `fonts:fetch` first |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run fonts:fetch` | Downloads build-time fonts (Satoshi) into git-ignored `src/fonts/vendor/` and checks the pinned SHA-256; skips when the pinned file is present, `-- --force` re-downloads, exit 1 on any failure or hash mismatch |
| `npm run build` | Production build (prints first-load JS per route); `prebuild` runs `fonts:fetch` first |
| `npm run start` | Serve the production build (`-- -p <port>` for another port) |
| `npm test` | Unit and component tests (Vitest) – see TESTING |
| `npm run test:e2e` | Browser smoke tests (Playwright) – see TESTING |
| `npm run review:shots -- <ID> [targets…] [--full-page]` | Review screenshots into `.review/<ID>/` – see TESTING |
| `npm run size` | First-load JS per route against the budget – see TESTING |
| `npm run lighthouse -- [routes…]` | Lighthouse scores against the thresholds – see TESTING |
| `npm run media:capture -- [slug…] [--headed]` | Stand-in project images: screenshots each project's live homepage (full Chromium, 1440×900, first screen, no login) into `public/media/projects/<slug>/home.webp` (≤ 250 KB); skips sign-in, blank or failing pages; prints the `media` entries – see `docs/content.md` |

Run tools only through the project's install: `npx --no-install <tool>` or `npm run <script>`. Never a bare `npx <name>`.

CI (`.github/workflows/ci.yml`) runs on every pull request to `main`, on the Node version in `.nvmrc`: `npm ci` → typecheck → lint → build → unit tests → Playwright Chromium install (with system deps) → smoke tests → size report. The Playwright report is uploaded as an artifact only when a step fails. Lighthouse and screenshots are local only.

## TESTING

All checks run against the project's own install. Scripts that need a server start `next start` on a **free port** and stop it when done (no process is left running). Output folders are git-ignored: `.review/`, `.lighthouseci/`, `test-results/`, `playwright-report/`. `Blender Assets/` is excluded from every test, lint and capture glob.

| Command | What it checks | Output |
|---|---|---|
| `npm test` | Vitest + jsdom + Testing Library (jest-dom matchers): `src/**/*.test.{ts,tsx}`. Today: the home page (inside the shell) renders name (only `h1`), role, pitch and availability inside the one `main`, the six chapter sections in order with their ids (`top`, `about`, `experience`, `work`, `skills`, `contact`), about, roles, skill groups, the five featured projects linking to their case studies, services and the email link, hero links to Work and Resume, a skip link to `#main`, and the footer (email, GitHub, LinkedIn, copyright); `/work` (all eight, featured first, role, stack, images with alt and size, framed (background bezel) and dimmed with the hover/focus lift, the dim rule only under `(hover: hover) and (pointer: fine)` in `globals.css`, a readout tile with the sign-in label for each project without a public preview, metadata); `/work/<slug>` (every slug prerendered, problem/role/approach/outcome/stack/links/media, absent fields left out, the readout tile as a short band (`min-h-readout-band`, not 16:10) in place of a missing screenshot, the screenshot undimmed on its own page, surface bezel, neighbour links, `notFound()` for an unknown slug, metadata); `/resume` (experience, education, skills, `<time>` dates, the PDF download); **content schema** (`src/content/schema.test.ts`: the real data passes; a missing field, a wrong type, an unknown key, BRIEF limits, featured-needs-outcome, duplicate slugs, http links, media folder, `noPublicPreview` with media or an unknown reason, dates and empty labels each fail with a message naming the field; the owner's roles for the reviewed projects, EngineerHUB's internship included); **content files** (every media file and the PDF exist, WebP size matches the data, stand-ins ≤ 250 KB); **content rules** (`src/content/content-rules.test.ts`: Twizzr's banned framing nowhere, no phone-number pattern in `src/`, `public/` (the PDF is binary, not scanned), `docs/`, `scripts/`, `e2e/`); the launch switch drives robots metadata, `robots.txt` rules and the `X-Robots-Tag` header, tested for both values by mocking `@/config/site` (the real switch is never edited); navigation has the six links in order with their targets, and Work and Resume as quick links before the menu button; the mobile menu (aria-expanded/aria-controls, Escape closes and returns focus, choosing a link closes it); the Simple-view switch and store (aria-pressed, persisted, survives `localStorage` throwing, follows other tabs); **contrast** – every pair in `src/styles/contrast-pairs.ts`, computed from the colour tokens read out of `globals.css`, text ≥ 4.5:1 and non-text ≥ 3:1; **tokens only** – no raw hex/colour functions, arbitrary values with units or numeric durations in `src/components` and `src/app` `.tsx` files. `next/font/google` and `next/font/local` are stubbed in `vitest.setup.ts` (add a name there when a new Google font is used); unit tests never need the downloaded font files. `npm run test:watch` for watch mode. | Terminal |
| `npm run test:e2e` | Playwright, Chromium only, against a production build (`next build` + `next start` via Playwright's `webServer`; `E2E_SKIP_BUILD=1` reuses an existing build). Projects `desktop` 1440×900 and `phone` 390×844 (touch, 3×). Checks (`e2e/smoke.spec.ts`): every route (`/`, `/work`, each `/work/<slug>`, `/resume`) returns 200 with no console or page errors and no failed requests after scrolling to the bottom (no allowlist), one `main` landmark and one `h1`; `X-Robots-Tag: noindex, nofollow` while not launched (absent once launched); an unknown route returns 404. Fast lane (`e2e/fast-lane.spec.ts`): name, role, pitch and availability in the server HTML of `/`; Work and Resume visible in the header (no menu) on every page, 404s included; `/no-such-page` and `/work/no-such-project` answer 404 with the styled page in the shell; Tab reaches every link in `main` on `/work` and a case study, each with a solid focus outline; with JavaScript off, `/`, `/work` (images load), a case study and `/resume` show all their content; unique titles per page; the PDF is served; CLS ≤ 0.05 on `/`, `/work`, `/work/twizzr`; project screens: (desktop) a card's screenshot rests dimmed and lifts to full brightness when Tab reaches its card (and dims again when focus moves on), at once under reduced motion (no filter transition); (phone, touch) no card screenshot is dimmed; the case-study readout band is ≤ 240 px high on desktop (≤ 200 px on phone, under half its width); the readout tile on `/work` and each no-preview case study, and (desktop) cards in one row on `/` and `/work` share their height with the actions aligned. Shell (`e2e/shell.spec.ts`): Tab from the skip link reaches Work, About, Experience, Skills, Contact, Resume and the Simple-view switch in order (on phone: Work and Resume first as quick links, then the menu opened with Enter), every focus stop shows the 2 px accent-signal outline and is on screen; the skip link focuses `main`; the phone menu closes on Escape and returns focus; `/dev/styleguide` and `/dev/type` return 404 (skipped when the build has `ENABLE_DEV_PAGES=1`); no horizontal scroll at 360 px (= 200 % zoom on 720 px) and 1920 px; without JavaScript the nav links are shown; the status dot is the signal accent and pulses, and reduced motion stops the pulse and hides its ring. Tests live in `e2e/`. First run on a machine: `npx --no-install playwright install chromium`. | Terminal; on failure `test-results/` (traces); in CI also `playwright-report/` |
| `npm run review:shots -- <ID> [targets…] [--headed] [--full-page]` | Builds, then captures each target on desktop 1440×900 (1×) and phone 390×844 (3×). A target is a route (`/`, the default) or a name in `scripts/review/targets.mjs`; a named target may set its own `viewports` and a `prepare` step. Named today: `home-360` (`/` at 360×780, 2×) and `menu-open` (phone, menu opened). PF-008 adds chapter stops. A route that does not exist (e.g. `/no-such-page`) captures the 404 page. `--full-page` captures the whole page; pages taller than 16 000 device px are split into `-part1`, `-part2` … (Chromium repeats the image beyond ~16 384 px). Dev pages need `ENABLE_DEV_PAGES=1` in the environment (the script's build reads it). | `.review/<ID>/<target>-<viewport>.png`, `capture.json` (viewport, URL, timestamp, full-page, WebGL vendor/renderer and whether it is a real GPU) |
| `npm run size` | After `npm run build`: for each page route in the build (plus the 404 page), fetches the served HTML, collects every JS file it loads (`<script src>`, `<link rel=preload/modulepreload as=script>`), measures gzip (zlib default level, as `next start` serves it) and Brotli (q11). Gate: first-load JS ≤ 200 KB **gzip** (the stricter of the two). `nomodule` polyfills are printed but not counted (modern browsers never load them). Dynamic routes are measured on the sample paths in `budgets.dynamicRouteSamples` (`/work/twizzr`, `/work/softboard-lite`). Then **page weight**: each route in `budgets.pageWeight.routes` (`/work`, `/work/twizzr`, `/resume`) is loaded in Playwright's Chromium on desktop 1440×900 and phone 390×844 (3×), scrolled to the bottom so lazy images load; every response's bytes on the wire (headers + encoded body) are summed, by type. Gate ≤ 1 MB per route and viewport (STANDARDS §3, a fast-lane page without video); `/` is printed for information only. Exit 1 over a limit. | Terminal tables |
| `npm run lighthouse -- [routes…]` | Builds, serves, and runs `lhci collect` in Playwright's Chromium: Lighthouse mobile config (its default: phone emulation, simulated throttling), 3 runs per route (default `/`), median per category. Gates: performance ≥ 90, accessibility ≥ 95, best practices ≥ 95, SEO ≥ 95. While the site is not launched, `is-crawlable` fails by design: the SEO gate leaves that audit out (weighted the way Lighthouse weights the category) and it is printed separately as "expected before launch". Local only, not in CI. | Terminal; `.lighthouseci/reports/` (HTML + JSON per run) |

Limits live in one file, `budgets.config.mjs` (values from STANDARDS §3; later items add the 3D chunk and asset limits there). Changing a value is an owner decision.

**GPU note.** Captures and numbers only count when they ran on a real GPU (STANDARDS §8), and every capture records what it got in `capture.json` (`webgl.renderer`, `webgl.gpu`: `hardware`, `software (not a real GPU)` or `no WebGL context`). `review:shots` launches Playwright's full Chromium (`channel: "chromium"`, new headless mode). On the owner's Windows laptop that gets the real GPU even headless (2026-11-21: WebGL 2, `ANGLE (AMD, AMD Radeon(TM) Graphics … Direct3D11 …, D3D11)`). Playwright's default headless shell, which the smoke tests use, gets **SwiftShader** (software) even on that laptop, so never take captures or frame numbers from it. If a machine reports SwiftShader or no WebGL, rerun with `--headed`, and say in the report which renderer the images came from. CI runners have no GPU: the smoke tests there run on a software renderer and must not depend on WebGL output.

Note: `typecheck` works on a clean checkout because no code uses Next's generated route types. If code starts using `PageProps` / `LayoutProps`, the script must run `next typegen` first.

## Launch switch

One boolean: `SITE_LAUNCHED` in `src/config/site.ts`. It is `false` until launch (PF-026 flips it on the owner's go). While `false`:

1. every page has `<meta name="robots" content="noindex, nofollow">` (`metadata.robots` in `src/app/layout.tsx`);
2. every response carries `X-Robots-Tag: noindex, nofollow` (`headers()` in `next.config.ts`, source `/:path*`);
3. `/robots.txt` is `Disallow: /` (`src/app/robots.ts`).

When `true`, all three lift. Do not set `robots` metadata in any child layout or page: metadata merges shallowly and a child value would replace the switch.

## Design system and DOM shell (PF-005)

**Tokens – one source: the `@theme` blocks in `src/app/globals.css`.** Tailwind makes each a utility and a `:root` custom property.

| Group | Tokens (utility examples) |
|---|---|
| Colour (BRIEF §4 "Hex (DOM)", dark only) | `background` #07090C · `surface` #12161C · `surface-raised` #1C222A · `accent-trace` #E08A3C · `accent-signal` #CFF6FF · `text` #E8ECF1 · `text-muted` #8E97A3 → `bg-surface`, `text-text-muted`, `border-accent-signal` |
| Derived tints | only `color-mix(in srgb, var(--color-a) N%, var(--color-b))` of palette tokens: `line`, `line-strong` (borders), `signal-soft` (selected chip, selection), `signal-line` (link underline), `trace-hover` (primary button hover), `signal-glow` (status dot glow, `shadow-signal-halo`). Tailwind's default palette is removed. |
| Type (fluid, rem bounds) | `text-label` (mono labels) · `text-sm` · `text-base` · `text-lg` · `text-xl` · `text-2xl` · `text-3xl` · `text-display`; utility `label-mono` = mono, label size, tracked, uppercase |
| Spacing | Tailwind's 4 px scale (`p-1` = 4 px) plus `gutter` (fluid page gutter), `header` (4rem), `section` (fluid), `tap` (44 px); widths `max-w-content` (80rem), `max-w-prose` (40rem) |
| Radii | `rounded-none` 0 · `rounded-xs` 2 px · `rounded-sm` 4 px (others removed) |
| Screens | `aspect-screen` (16:10, the display frame) · `screen-dim` (filter: brightness(`--screen-dim`), a project screenshot at rest in a card, only under `(hover: hover) and (pointer: fine)` – touch screens never dim; `group-hover:filter-none` / `group-focus-within:filter-none` lift it) · `readout-band` (spacing, `min-h-readout-band`: a case study's readout tile, `clamp(9rem, 6rem + 10vw, 15rem)` = 240 px on desktop, 144 px on phones) |
| Timing | `duration-instant` 120 ms · `duration-fast` 200 ms (default) · `duration-moderate` 320 ms · `duration-slow` 600 ms; `ease-signal` (soft ease-out, default) · `ease-linear`; `animate-signal-pulse` (the status dot's ring grows and fades; resting opacity 0, so reduced motion hides it) |
| Focus | one style everywhere: global `:focus-visible` = utility `focus-ring` (2 px solid accent-signal, 2 px offset). Never remove it. |

Reduced motion: only opacity may transition; animations stop (end of `globals.css`). When a component puts a colour on a new background, add the pair to `src/styles/contrast-pairs.ts` (the test and the style guide read it).

**Components** (tokens only, `clsx` for classes):
- `src/components/ui/`: `Button` (variant `primary` | `secondary` | `ghost`, size `sm` | `md` | `lg`, `disabled`; `buttonClasses()` shared), `ButtonLink` (a link styled as a button: internal pages via `next/link`, files/`download`/other sites as a plain anchor), `Link` (variant `inline` | `nav` (with `current`) | `external` – new tab, says so to screen readers; internal paths use `next/link`), `Chip` + `ChipGroup` (real radio/checkbox input in a label, inside fieldset/legend – native keyboard and no-JS form behaviour), `Panel` (tone `surface` | `raised`, optional readout `label`), `StatusChip` (availability text; a lit signal-accent dot with a soft pulsing ring, steady under reduced motion), `SectionHeading` (`index`, `label` → "03 / EXPERIENCE", then h2/h3).
- `src/components/layout/`: `SiteShell` (skip link, header, `main#main`, footer – used by the root layout), `SiteHeader`, `SiteNav` (client: inline from `lg`; below `lg` the `quick` links Work and Resume stay in the header and the rest sit behind a disclosure menu; Escape closes and returns focus; shown as a list without JS), `SimpleViewSwitch` (client, `aria-pressed`), `SiteFooter`, `SkipLink`, `Container` (`grid` = 4/8/12 columns), `PageHeader` (fast-lane page top: kicker, the h1, intro).
- `src/components/sections/`: the home page's chapter sections (`HeroSection` … `ContactSection`) in a shared `HomeSection` frame (section id, `data-chapter`, index label, h2).
- `src/components/projects/`: `ProjectCard` (whole card is one link to the case study; hover and focus look the same; cards in a row share their height, action at the bottom), `ProjectScreen` (`placement` `card` | `page`; the display frame `ScreenFrame` – bezel (`background` in cards, `surface` on case studies), thin border, 16:10 screen – holding the screenshot, dimmed at rest in cards on hover-capable devices, or a readout tile when there is no media (16:10 in cards, a short `readout-band` on case studies): name and trace line `aria-hidden` (they repeat the heading), label "PREVIEW · BEHIND SIGN-IN" read aloud, only where the data sets `noPublicPreview`), `ProjectImage` (`next/image`, size from the data, cover from the top, `eager` for the LCP image), `StackList`, `image-sizes.ts` (the `sizes` strings – grid card, case-study screen, case-study media – measured from the layout at 360–1920 px; change them with the layout, never below the drawn width).
- `src/components/career/`: `RoleList`, `EducationList`, `SkillGroups` – shared by `/` and `/resume`.
- Simple view: store `src/lib/simple-view.ts` (no React; `localStorage` key `simple-view`, try/catch everywhere), hook `src/lib/use-simple-view.ts`. PF-007 wires it to the static tier.

**Fonts module `src/fonts/`:** four pairings, all served by the site itself with generated fallback metrics (→ no layout shift); the browser never contacts a font host. **Active: D** (owner decision D-31) – headings Satoshi, body Inter, labels JetBrains Mono (`pairing-d.ts`). Production loads only D; A, B, C appear on `/dev/type` only. A, B, C are SIL OFL via `next/font/google` (downloaded at build): A Space Grotesk + Inter + JetBrains Mono (`pairing-a.ts`), B Geist + Geist Mono (`pairing-b.ts`), C Archivo + IBM Plex Sans + IBM Plex Mono (`pairing-c.ts`). D = A with Satoshi headings: Satoshi is under the ITF Free Font License, which allows self-hosting but forbids making the files available through a public repository, so **its files are never committed**: `scripts/fetch-fonts.mjs` (npm `prebuild`/`predev`) downloads the official Fontshare package (`https://api.fontshare.com/v2/fonts/download/satoshi`), extracts `Satoshi-Variable.woff2` and `FFL.txt` byte for byte into `src/fonts/vendor/satoshi/` (git-ignored: `/src/fonts/vendor/`), and fails the build (exit 1) if the download or the checks fail; `next/font/local` reads the file from there. Never subset, convert or modify the Satoshi file (FFL §02). **Pinned file:** `Satoshi-Variable.woff2` must match the `sha256` in `scripts/fetch-fonts.mjs` (`e739aff9…3eb47f`, 42 588 B, pinned 2026-11-23). A file on disk that differs is downloaded again; a download that differs fails the build with both hashes and changes nothing on disk. To accept a new Satoshi release on purpose (owner decision): read its `FFL.txt`, check it on `/dev/type`, set the `sha256` value to the "received" hash the failed run printed, run `npm run fonts:fetch -- --force`. **Outage risk:** every build (local, CI, Vercel) needs Fontshare reachable unless `src/fonts/vendor/` already holds the pinned file (local machines keep it between builds; CI and Vercel start clean). If Fontshare is down, moves the URL, or serves a new release, builds stop until it is back or the pin is updated – there is no fallback font by design. A short-term escape is switching `src/fonts/index.ts` back to pairing A (owner decision). Production loads one pairing: `src/fonts/index.ts` re-exports it as `activePairing` – switching is that one line. Each pairing sets `--ff-heading`, `--ff-body`, `--ff-mono`; utilities `font-heading`, `font-sans` (body), `font-mono`. Keep pairings in separate files: next/font preloads every font of every module a page imports.

**Dev-only pages** `/dev/styleguide` (every component and state, colour tokens with contrast ratios, type scale, spacing/radii/timing) and `/dev/type` (the four pairings side by side) are files named `page.dev.tsx`. `next.config.ts` adds the `dev.tsx` page extension only when **`ENABLE_DEV_PAGES=1`** is set at build/dev time; otherwise they are not routes, not built, and return 404 (also on Vercel – never set the variable there). Use: `$env:ENABLE_DEV_PAGES="1"; npm run dev` (PowerShell). The name is in `.env.example`.

## Content model and fast lane (PF-006)

**Content** is typed data in `src/content/data/` (identity and about, career = experience/education/skills/services, projects, contact-flow options, site = nav/footer/PDF/page meta/home sections, ui = interface words). It comes from BRIEF §8 only: nothing invented, optional fields left out where §8 says "later", Twizzr always "hyperlocal commerce", never a phone number (only inside the PDF, D-27). `src/content/schema.ts` (zod, strict) validates it when `@/content` is first imported, so `next build` fails with a message naming the field. `next.config.ts` (a function of the phase) also checks that media files and the PDF exist with the stated pixel size, during build and dev. Content is server-only: client components get props and import types from `@/content/schema`. No copy in components. How to add a project or replace an image: `docs/content.md`.

**Routes:** `/` (static chapter sections in D-24 order: `#top`, `#about`, `#experience`, `#work`, `#skills`, `#contact`), `/work` (all projects, featured first), `/work/[slug]` (`generateStaticParams` over all projects; `ensureStatic = "navigation"` so an unknown slug answers a real 404), `/resume` (with `public/resume/swapnil-raj-resume.pdf`), `not-found.tsx` (styled, in the shell). Titles and descriptions come from `site.meta` or the project; never set `robots` in a page. Images: `next/image` with `sizes` (`src/components/projects/image-sizes.ts`) and the data's `width`/`height`; only the page's first image is eager with `fetchPriority="high"` (the first card on `/work`, the screen on a case study), every other image is lazy; served as AVIF, WebP where the browser has no AVIF, quality 75 (`images.formats` / `images.qualities` in `next.config.ts`; each format is optimised on first request and then cached); stand-ins in `public/media/projects/<slug>/` are `provisional: true` (`npm run media:capture`).

## Git rules (WORKFLOW §3)

- One branch per item from the latest `origin/main`: `<type>/<ID>-<short-slug>`, type = `feat`, `fix`, `test`, `chore` or `docs`.
- **Never** commit to `main`, push to `main`, merge, delete branches or force-push. Only the owner merges.
- Commit messages: `<ID>: <summary>` (e.g. `PF-003: repo scaffold`). No AI or tool names, no links, no `Co-Authored-By` lines. Same for PR titles and descriptions.
- PR: `gh pr create --base main --head <branch> --title "<ID>: <title>" --body-file <file in the OS temp folder>`. The body states what changed, assets, every check honestly (passed / pre-existing failure / not run – reason), budget numbers against limits, docs updated.
- Commits happen only in a commit prompt, never in a change prompt. Stage only the files the item changed.

## Safety rules (WORKFLOW §7)

- Stop and report on any failure; never improvise around a failed or blocked step.
- Never touch uncommitted work the prompt did not create (no stash, reset, clean or checkout over changes).
- Never open, print or copy credential files (`.env*`, key files, service-account JSONs). `.env*` is never committed; `.env.example` holds names only.
- The assets folder is read-only for code work.
- Production deploys, domain changes, repo visibility and submissions are done only by the owner.
- No secrets, keys, tokens, phone numbers, home address or private data in code, content, tests, docs, logs or commit messages. The **only** place a phone number may appear is inside the owner's resume PDF (D-27) – never in page text, HTML, structured data, metadata, code, docs or commits.
- Never invent facts about the owner. Missing content is a question, not a placeholder.
- No package beyond the item's "Packages this item may add". Removing or upgrading a package, `--force`, `--legacy-peer-deps`, `npm audit fix`, `npm update` need the owner first.
- Every report ends with: TASK / STATUS; FILES; VERIFIED; UNVERIFIED / ASSUMPTIONS; NUMBERS (each budget: value against limit); SCREENSHOTS (paths); QUESTIONS; RISKS; `git status --porcelain` before and after; branch and commits.

### Blender Assets (D-22)

`Blender Assets/` inside this folder is the owner's **only copy** of the Blender work. It is git-ignored by the rule `/Blender Assets/` at the end of `.gitignore`; keep that rule.

- Never write, move or delete anything in it. Read only (listing, approved exports for the pipeline).
- Never run `git clean -x` or `git clean -X`; never delete or re-clone this folder.
- After any `.gitignore` change, check `git check-ignore -v "Blender Assets/refs"` still matches.

## Conventions (condensed from STANDARDS.md)

### Architecture (§1)
- **DOM first.** Server-rendered document; every word of content is real HTML in reading order, readable with JavaScript off. The canvas is a fixed decorative layer behind it, hidden from assistive technology.
- **One persistent canvas**, mounted once, loaded as a lazy chunk after the DOM shell is interactive – never in any route's first-load JS.
- **Native scroll.** Lenis only smooths; ScrollTrigger maps scroll to `progress` (0–1), current `chapter` and `chapterProgress`. Nothing hijacks wheel, touch or keyboard.
- **One store for progress.** The scene reads it inside the frame loop without React re-renders. The camera pose comes from the Blender-authored path clip, scrubbed by `progress`.
- **Chapters are modules** in one registry (id, section id, scroll length, assets, tuning). Only the current chapter and its neighbours are mounted; the next one's assets preload; a leaving chapter disposes everything it created.
- **Content is typed data,** validated at build, shared by journey, fast lane and case studies. No copy hard-coded in components.

### Quality tiers (§2)
| Tier | For | Gets |
|---|---|---|
| `high` | capable laptops / desktops | everything |
| `medium` | weaker laptops, strong tablets and phones | lower pixel ratio, half-res bloom, fewer particles |
| `low` | most phones, weak GPUs | pixel ratio 1, low asset variants, simplified shaders, minimal post |
| `static` | no WebGL 2, reduced motion, data saver, context lost twice, 3D chunk failed, or "simple view" chosen | no canvas: same content as designed sections with Blender stills |

Tier chosen from capability checks, lowered on measured frame time, never raised within a visit. "Simple view" is a visible nav switch, remembered. Reduced motion = static tier. Every chapter states what each tier gets; static must look designed.

### Budgets (§3)
Per frame:

| | high | medium | low |
|---|---|---|---|
| Pixel ratio cap | 2 | 1.5 | 1 |
| Draw calls | ≤ 120 | ≤ 90 | ≤ 60 |
| Triangles on screen | ≤ 600 k | ≤ 350 k | ≤ 150 k |
| Largest texture side | 2048 | 2048 | 1024 |
| Texture memory on the GPU | ≤ 160 MB | ≤ 100 MB | ≤ 48 MB |
| Runtime lights / realtime shadows | ≤ 2 / none | ≤ 2 / none | ≤ 1 / none |
| Post-processing | bloom, grain, vignette, slight chromatic aberration | half-res bloom, grain, vignette | vignette; bloom only if frame time holds |
| Frame time, p95 | ≤ 16.7 ms (reference laptop) | ≤ 20 ms (reference laptop, throttled) | ≤ 33 ms (reference phone) |

Download (compressed transfer size):

| What | Limit |
|---|---|
| First-load JS of the DOM shell, any route | ≤ 200 KB |
| The lazy 3D chunk | ≤ 400 KB |
| Interactive hero (shell, 3D chunk, boot, `port` assets) | ≤ 3 MB high · ≤ 2 MB low |
| Each further chapter's assets | ≤ 2 MB high · ≤ 1 MB low |
| The whole journey | ≤ 12 MB high · ≤ 6 MB low |
| A fast-lane page without video | ≤ 1 MB |
| One project video loop | ≤ 1.5 MB, loaded only when its slab is in focus |

Page experience, every route, reference phone: LCP ≤ 2.5 s, CLS ≤ 0.05, interaction delay ≤ 200 ms. Lighthouse mobile on fast-lane pages: performance ≥ 90, accessibility ≥ 95, best practices ≥ 95, SEO ≥ 95 (journey route: performance reported, not gated). A budget that cannot be met is an owner decision, never a silent overrun.

### Rendering (§4)
- WebGL 2 (D-14). sRGB output; one tone mapping site-wide (chosen in PF-011).
- Static surfaces baked in Blender, drawn unlit. ≤ 2 runtime lights, no realtime shadows.
- Repeated meshes instanced; static meshes sharing a material merged.
- Transparency is the exception: additive glows or alpha-tested cut-outs only.
- Frame loop: no allocations, no React state updates, no layout reads.
- Pause rendering when the tab is hidden or the canvas is covered.
- Dispose everything created: geometries, materials, textures, render targets.
- Bloom only from true emitters; DOM text and baked surfaces stay clean.
- No flashing: at most three flashes per second; brightness peaks are ramps.
- Shaders live in one shared library, each with a low-tier variant and documented uniforms.
- Decoders/transcoders are self-hosted. At runtime the browser contacts no third-party host except Vercel's own analytics.

### Asset contract (§6)
- glTF Binary (`.glb`), +Y up, metres, transforms applied. Raw exports uncompressed; the pipeline compresses (Meshopt, KTX2 or WebP) and writes high and low variants.
- Chapter assets authored in world position; instanced props at the origin.
- Material prefixes: `BAKED_<set>` → unlit with baked image · `PBR_<name>` → lit · `SHADER_<name>` → registered site shader (unknown name warns loudly in dev) · `GLOW_<name>` → emissive, feeds bloom.
- Empties: `ANCHOR_<chapter>`, `HOTSPOT_<name>` (numbered slots like `HOTSPOT_slot_03`), `INST_<prop>_<nnn>`, `GLOW_<name>`.
- Masks in vertex-colour layer `Col`. Clips at 30 fps named `<object>_<verb>`, scrubbed by scroll both ways.
- Journey camera `CAM_journey`, clip `journey` in `world-path.glb`; chapter start markers `CH_<chapter>` in `world-path.json` (fps, first frame, last frame, marker frames).
- Raw exports never enter this repo. The pipeline writes site assets here and updates `docs/assets.md`. Over budget = the pipeline fails; nothing over a limit is committed.

### Accessibility and SEO (§7)
- Real DOM text, sensible heading outline, landmarks, skip link. Canvas decorative.
- Full keyboard use with visible focus; hover behaviour also on focus.
- Text over the canvas ≥ 4.5:1 contrast everywhere it can be read; each chapter defines a safe area or scrim.
- Reduced motion, 200 % zoom and screen readers supported on every route.
- 10-second rule: name, role and pitch in the server-rendered HTML; Work and Resume one action away from any page.
- Must work, or fall cleanly to static, inside in-app browsers (LinkedIn).
- SEO: unique titles and descriptions, canonical links, sitemap, structured data, social images. `noindex` stays on until launch (launch switch above).

### Code (§9)
- TypeScript strict; no `any` without a comment explaining why.
- Design tokens only – no raw colour, spacing or timing values in components.
- One folder per chapter (scene, DOM section, tuning, tests); shared pieces in shared folders; content in a content folder.
- Development-only code (tuning panel, perf overlay) is excluded from production by build-time conditions; the size report proves it.
- No runtime dependency for something a few lines would do.

## Folder map

```
.github/workflows/ci.yml   CI on pull requests: install, typecheck, lint, build, unit, e2e, size
Blender Assets/            owner's Blender work – git-ignored, read-only, never delete (D-22)
docs/                      README (index), architecture, content (how to edit content), assets, licences
e2e/                       Playwright browser smoke tests (smoke.spec.ts, shell.spec.ts, fast-lane.spec.ts)
scripts/                   fetch-fonts (build-time font download), size-report (+ page weight), review-shots, lighthouse, capture-project-media (stand-in images); lib/prod-server (free-port next start)
scripts/review/targets.mjs named capture targets and viewports for review:shots
src/app/                   App Router: layout.tsx, page.tsx (home sections), work/page.tsx, work/[slug]/page.tsx, resume/page.tsx, not-found.tsx, robots.ts, globals.css (Tailwind + design tokens); *.test.tsx beside the code
src/app/dev/               dev-only pages (page.dev.tsx) – built only with ENABLE_DEV_PAGES=1
src/components/ui/         Button, ButtonLink, Link, Chip/ChipGroup, Panel, StatusChip, SectionHeading
src/components/layout/     SiteShell, header, nav + mobile menu, Simple-view switch, footer, skip link, Container, PageHeader
src/components/sections/   home-page chapter sections (hero, about, experience, projects, skills, contact)
src/components/projects/   ProjectCard, ProjectScreen, ProjectImage, StackList, image-sizes (next/image `sizes`)
src/components/career/     RoleList, EducationList, SkillGroups (home and /resume)
src/config/site.ts         launch switch (SITE_LAUNCHED)
src/content/               content model: data/ (BRIEF §8 copy), schema.ts (zod), index.ts (validated exports), check-files.ts, format.ts; tests
public/media/projects/     project images per slug (stand-ins: provisional)
public/resume/             the owner's resume PDF (D-27)
src/fonts/                 font pairings (pairing-a/b/c/d.ts); index.ts picks the active one; vendor/ = build-time downloads (git-ignored)
src/lib/                   contrast maths, token parser, simple-view store + hook
src/styles/                contrast pairs; contrast and tokens-only tests
budgets.config.mjs         budget limits used by the size report and Lighthouse (STANDARDS §3)
playwright.config.ts       Playwright: desktop + phone projects, production webServer
vitest.config.mts          Vitest: jsdom, React plugin, @/* alias; vitest.setup.ts adds jest-dom
.env.example               env var names only, never values
.nvmrc                     Node major version for CI and local use
CLAUDE.md                  this file
CONTENT-LICENSE.md         content, media, models, resume: all rights reserved
LICENSE                    MIT, source code only
next.config.ts             Next.js config (function of the phase): X-Robots-Tag header, dev-page flag (pageExtensions), image formats (AVIF, WebP) and qualities, content file check at build/dev
```

Docs to update in the same PR as the change: this file, the affected `docs/` files, every new asset in `docs/assets.md`, every third-party thing in `docs/licences.md`.
