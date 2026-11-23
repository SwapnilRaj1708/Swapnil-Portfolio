# Architecture

Outline only. Each section is filled in by the item that builds it.

## 1. Architecture

### DOM first
Every page is server-rendered HTML inside one shell (`src/components/layout/site-shell.tsx`, used by the root layout): skip link → sticky header (name, persistent navigation, "Simple view" switch) → the one `main` landmark (`id="main"`) → footer (email, GitHub, LinkedIn, copyright). Text and controls live only in the DOM, styled with the design tokens in `src/app/globals.css`. The canvas (PF-007) will sit behind this layer. The only client components so far are the navigation (mobile menu) and the switch. Below `lg` the header keeps the `quick` links (Work, Resume) next to the menu button, so they are one tap away on every page (BRIEF §2); the other links sit behind the menu. Without JavaScript the navigation is shown as a plain list (`noscript:` = `@media (scripting: none)`) and the switch is hidden. All text comes from the content model (below).

### Routes (PF-006, BRIEF §5)
All are prerendered at build (Cache Components on) and readable with JavaScript off. None needs WebGL.

| Route | File | What |
|---|---|---|
| `/` | `src/app/page.tsx` | The journey's content as designed static sections, in chapter order (BRIEF §3, D-24): Hero `#top`, About `#about`, Experience `#experience`, Projects `#work` (the featured projects, each linking to its case study), Skills `#skills`, Services and Contact `#contact`. Sections live in `src/components/sections/`; each is tagged `data-chapter="<chapter>"`. This is what the static tier shows; the 3D journey draws behind the same DOM. |
| `/work` | `src/app/work/page.tsx` | Every project, featured first, then "More projects", each with role and stack |
| `/work/<slug>` | `src/app/work/[slug]/page.tsx` | Case study: role, org and year, stack, links, image, then Problem, Approach and Outcome; previous and next project. `generateStaticParams` returns every project. `ensureStatic = "navigation"` keeps the route fully static, and makes an unknown slug render completely before anything is sent, so `notFound()` answers 404 rather than streaming a 200 fallback shell. |
| `/resume` | `src/app/resume/page.tsx` | Experience, education, skills; download of `public/resume/swapnil-raj-resume.pdf` (the owner's own PDF, D-27) |
| 404 | `src/app/not-found.tsx` | Styled page inside the shell, with Home, Work and Resume |

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
