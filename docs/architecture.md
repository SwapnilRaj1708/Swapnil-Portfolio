# Architecture

Outline only. Each section is filled in by the item that builds it.

## 1. Architecture

### DOM first
Every page is server-rendered HTML inside one shell (`src/components/layout/site-shell.tsx`, used by the root layout): skip link → sticky header (name, persistent navigation, "Simple view" switch) → the one `main` landmark (`id="main"`) → footer (email, GitHub, LinkedIn, copyright). Text and controls live only in the DOM, styled with the design tokens in `src/app/globals.css`. The canvas (PF-007, "One persistent canvas" below) sits behind this layer, where the build has it. The client components are the navigation (mobile menu), the switch and the contact flow (PF-019, below). Below `lg` the header keeps the `quick` links (Work, Resume) next to the menu button, so they are one tap away on every page (BRIEF §2); the other links sit behind the menu. Without JavaScript the navigation is shown as a plain list (`noscript:` = `@media (scripting: none)`) and the switch is hidden. All text comes from the content model (below).

### Routes (PF-006, BRIEF §5)
All are prerendered at build (Cache Components on) and readable with JavaScript off. None needs WebGL.

| Route | File | What |
|---|---|---|
| `/` | `src/app/page.tsx` | The journey's content as designed static sections, in chapter order (BRIEF §3, D-24): Hero `#top`, About `#about`, Experience `#experience`, Projects `#work` (the featured projects, each linking to its case study), Skills `#skills`, Services and Contact `#contact`. Sections live in `src/components/sections/`; each is tagged `data-chapter="<chapter>"`. Since PF-028 the hero stands on the Port still and every other section opens on its chapter's still (see "Static tier: the stage 1 home" in §2). This is what the static tier shows; the 3D journey draws behind the same DOM. |
| Social images | `src/app/opengraph-image.tsx`, `src/app/work/opengraph-image.tsx`, `src/app/resume/opengraph-image.tsx` | 1200 × 630 PNGs drawn at build by next/og (PF-028), see "Social images, icons, manifest" below |
| Icons, manifest | `src/app/favicon.ico`, `icon1.png`, `icon2.png`, `apple-icon.png`, `manifest.ts` | Next's icon and manifest file conventions (PF-028) |
| `/work` | `src/app/work/page.tsx` | Every project, featured first, then "More projects", each with role and stack |
| `/work/<slug>` | `src/app/work/[slug]/page.tsx` | Case study: role, org and year, stack, links, image, then Problem, Approach and Outcome; previous and next project. `generateStaticParams` returns every project. `ensureStatic = "navigation"` keeps the route fully static, and makes an unknown slug render completely before anything is sent, so `notFound()` answers 404 rather than streaming a 200 fallback shell. |
| `/resume` | `src/app/resume/page.tsx` | Experience, education, skills; download of `public/resume/swapnil-raj-resume.pdf` (the owner's own PDF, D-27) |
| 404 | `src/app/not-found.tsx` | Styled page inside the shell, with Home, Work and Resume |
| Errors | `src/app/error.tsx`, `src/app/global-error.tsx` | PF-029. `error.tsx`: a client error boundary for a failure inside a page, rendered inside the root layout (the shell stays) – the 404 page's look (`ErrorPanel`): label, h1, one line, Try again (Next 16's `retry`), Home, Work, Resume. `global-error.tsx`: when the root layout itself fails; its own `<html>` and `<body>` with `globals.css`, the active fonts, a React `<title>` (client components cannot export metadata) and plain links (a full page load). Neither shows the error's message, stack or digest. Words in `src/content/data/error-copy.ts`: client components may not import `@/content` (zod would join the bundle), so they import that plain object; `ui.ts` includes it as `ui.error` and the build validates it |
| `/sitemap.xml`, `/robots.txt` | `src/app/sitemap.ts`, `src/app/robots.ts` | PF-029, see "Launch switch and site address" below |
| `/contact/result/<status>` | `src/app/contact/result/[status]/page.tsx` | Result pages of the contact form without JavaScript (PF-019): `sent`, `invalid`, `rate-limited`, `failed`; prerendered, any other status is a 404 |
| `POST /api/contact` | `src/app/api/contact/route.ts` | Contact delivery (PF-019), see "Contact flow and delivery" below. The only dynamic route |

Each page takes its title and description from the content (`site.meta`, or the project's `name` and `oneLine`), through the root layout's `titleTemplate`, and sets its own canonical link (`alternates.canonical`, its path; made absolute with `metadataBase`). No child segment sets `robots`, so the launch switch stays in charge. Images use `next/image` with `sizes` per layout (measured, in `src/components/projects/image-sizes.ts`, so phones fetch the smallest sharp file) and the intrinsic `width`/`height` from the content, so no layout shift. Formats: AVIF, else WebP, quality 75 (`next.config.ts`). The first image on `/work` and the case-study image load eagerly at high priority; the rest are lazy. All three fonts stay preloaded: each is on every page's first screen, and dropping the preloads (tested in PF-006) brought no LCP gain and a small font-swap layout shift (CLS 0.003–0.004).

**Lighthouse and `/work`.** On phones the LCP of `/work` is the first card's screenshot. Lighthouse's simulated throttling (Lantern) counts every script that ran before an image LCP as blocking it, so the simulated LCP there is about the time to download and run the shell's JavaScript on slow 4G (≈ 3.1–3.4 s), even though the image paints together with the first paint. With applied throttling (`--throttling-method=devtools`: real slow 4G and 4× CPU) the same page measures ≈ 2.0–2.4 s. Case studies are text-LCP routes and are not affected (≈ 0.77 s simulated). Since PF-028 `/` is an image-LCP route too: its LCP is the hero still, so D-32 applies there as well. `npm run lighthouse -- / --applied` runs the applied-throttling measurement and gates LCP ≤ 2.5 s.

**Social images, icons, manifest (PF-028).** The root layout sets only the shared social metadata: `openGraph: { type: "website", siteName }` and `twitter: { card: "summary_large_image" }`. Next fills `og:title`, `og:description` and the `twitter:*` text from each page's own title and description, and `og:image` and `twitter:image` from the nearest `opengraph-image` file. For that reason pages must not set `openGraph` or `twitter` themselves: metadata merges shallowly, so a page's value would replace the layout's and drop the image. The images are `src/lib/social-image.tsx` (next/og `ImageResponse`). Each draws the `still-social` render, the page label (Work, Resume; none on `/`), and the name and role from the content, in Inter Medium.

- Satoshi cannot be used: its build-time download is WOFF2, and next/og reads only TTF, OTF and WOFF. `scripts/fetch-fonts.mjs` therefore also downloads Inter's TTF from Google Fonts, pinned by SHA-256.
- The font and the JPEG are read at module scope, as the installed docs advise. With Cache Components, a file read inside the handler counts as uncached I/O while prerendering, and it turned an image route dynamic in testing.
- Case studies, the 404 page and the contact result pages use their section's image or the home page's. A per-project image was tried: `/work/[slug]/opengraph-image` prerendered only one of the eight slugs under Cache Components, and the others would have rendered at request time without the build-time font.
- `metadataBase` is `https://swapnilraj.in` (PF-029, D-37) on every deployment, so `og:image` and canonical URLs always name the site's address. A preview's social tags therefore point at the live site's images; previews are noindex and not shared, so that is accepted.

### Launch switch and site address (PF-029)

`src/config/site.ts`: the site is public only when `SITE_LAUNCHED` is `true` (set in PF-029, the stage 1 launch, D-26) **and** the build is the Vercel production deployment (`VERCEL_ENV === "production"`; Vercel sets it at build and run time). Previews, local builds and the dev server stay noindex whatever `SITE_LAUNCHED` says, so a preview link can never be indexed and the switch cannot be forgotten on a branch. Pages are prerendered, so the build's environment decides.

| | Not public (previews, local) | Public (Vercel production) |
|---|---|---|
| `<meta name="robots">` | `noindex, nofollow` (root layout) | none |
| `X-Robots-Tag` header | `noindex, nofollow` on every path (`next.config.ts`) | none |
| `/robots.txt` | `Disallow: /`, no sitemap | `Allow: /` and `Sitemap: https://swapnilraj.in/sitemap.xml` |
| `/sitemap.xml` | served (not linked) | served: `/`, `/work`, each case study, `/resume` |
| Analytics | not rendered | Vercel Web Analytics and Speed Insights |

The sitemap has no `lastModified`: the site keeps no per-page edit dates, and a build date would claim every page changed on every deploy. Contact result pages, the 404 and dev pages are left out. To check the public state locally, build and serve with `VERCEL_ENV=production` (only for that check).

**Analytics (D-19).** `src/components/layout/site-analytics.tsx` renders `<Analytics />` (`@vercel/analytics/next`) and `<SpeedInsights />` (`@vercel/speed-insights/next`) at the end of `<body>`, only when `IS_PRODUCTION_DEPLOYMENT`. Both are cookieless (no consent banner) and inject their script from the site's own `/_vercel/insights/` and `/_vercel/speed-insights/` paths, which Vercel serves once the owner switches them on – the only analytics host STANDARDS §4 allows. Nothing is rendered elsewhere, so local runs, previews and tests make no `/_vercel/*` request (which would 404 outside Vercel). Their client code is in the bundle on every build (a server component's import decides the bundle, not whether it renders): about 1.9 KB gzip of first-load JS (measured in PF-029 against a build without them; the error boundary added about 2.2 KB more).

The icons and the manifest follow Next's file conventions in `src/app/`:

- `favicon.ico` holds 16, 32 and 48 px images.
- `icon1.png` (192 px) and `icon2.png` (512 px) are linked as icons and listed in the manifest.
- `apple-icon.png` is 180 px.
- `manifest.ts` gives the name, the short name "Swapnil Raj", and `#07090C` as theme and background colour.

The root layout's `viewport.themeColor` is the same colour. These places cannot read CSS variables, so they take the hex values from `src/styles/palette.ts`. `palette.test.ts` keeps that file equal to the tokens in `globals.css`.

### One persistent canvas (PF-007)

**The journey switch (D-39).** `src/config/journey.ts`. The 3D layer is built in when the build is **not** the Vercel production deployment, or when `JOURNEY_LAUNCHED` is `true`. It is `false` until PF-026 flips it at the stage 2 launch. So previews, local builds and the dev server get the canvas, and swapnilraj.in keeps the stage 1 home exactly.

The decision is made at build time. `next.config.ts` inlines three flags into every bundle, server and browser, through its `env` setting (`journeyBuildEnv`):

| Flag | "on" when |
|---|---|
| `JOURNEY_LAYER` | the 3D layer is built in (the rule above) |
| `JOURNEY_TIER_OVERRIDE` | the layer is on and the build is not the production deployment: the `?tier=` override and the `window.__journey` debug hooks |
| `JOURNEY_DEV_TOOLS` | the layer is on and the build is `next dev` or has `ENABLE_DEV_PAGES=1`: the tuning panel and the performance overlay |

Code that imports the 3D layer tests the flag in place: `src/components/journey/gate.tsx` imports the loader and the hero's tier backdrop inside `if (process.env.JOURNEY_LAYER === "on")`, and `scene/journey-canvas.tsx` imports the dev tools the same way. Where a flag is "off", that branch is dead code. The bundler drops the import, so the module is in no chunk. The server components (`SiteShell`, `HeroSection`, `HomeSection`, the root layout) render the journey parts only when the flag is on. A production build is therefore the stage 1 page in its markup too: the hero keeps `bg-background` and its server-rendered still. `npm run size` searches every built chunk and fails if three.js, React Three Fiber or the loader turn up in a build without the layer. Unit tests never go through `next.config`, so they see the flags as unset (= off, the production page) unless a test stubs one.

**Measured (PF-007).**

- **The lazy 3D chunk:** one file, 245.7 KB gzip (200.9 KB Brotli, 931.2 KB raw; limit 400 KB). three.js and React Three Fiber are in no route's first-load JS.
- **First-load JS of `/`:** 161.4 KB gzip with the layer, 158.5 KB in a production build. Main's production build of `/` was 157.2 KB: the +1.3 KB on every route is the inert gate module and `next/dynamic`.
- **Production HTML:** the prerendered home, `/work`, a case study, `/resume`, the 404 and a contact result are identical to main's, scripts and hashes aside, except for the Simple-view knob fix below.

**Measured (PF-008, 2026-11-25).**

- **The lazy journey chunks:** one file again (the bundler put the spine, gsap, ScrollTrigger, Lenis and the rig with three.js and R3F): 312.4 KB gzip (258.5 KB Brotli, 1122.5 KB raw; limit 400 KB for the sum), +66.7 KB over PF-007. None of it is in any route's first-load JS.
- **First-load JS of `/`:** 161.6 KB gzip with the layer, 158.6 KB in a production build (PF-007: 158.5 KB).
- **Production build:** no file in `.next/static` contains three.js, R3F, gsap, ScrollTrigger, Lenis, the rig or the loader, nor the chapter bridge's or the scrim's names; the prerendered home, `/work`, two case studies, `/resume`, a contact result and the 404 are identical to main's, scripts and hashes aside (the social images byte for byte; only their URL's hash query differs).
- **Scene numbers** (`.review/PF-008/numbers.md`, the reference laptop's integrated AMD Radeon, headed, `?gpu=low-power`): at every chapter stop 1–3 draw calls, 72–784 triangles, no textures; frame p95 8.8–10.1 ms on every tier at the 120 Hz display's cap.
- **The stand-in pillars on screen:** rgb(3, 16, 29) (relative luminance 0.0048), darker than `surface-raised` (0.0156) – PBR Neutral tone mapping lowers dark values and shifts them toward blue.

**The layer.** `src/components/journey/journey-layer.tsx` (client, loaded with `next/dynamic` and `ssr: false`, rendered by `SiteShell` after the footer). It is mounted once, so it survives client navigations. Its host is `<div aria-hidden="true" data-journey-host>`: fixed, the full viewport, `-z-10`, `pointer-events: none`. The canvas inside has no tab stop. The host fades in (`opacity`, `duration-slow`) once the first frame is drawn, and only while a see-through section is in view.

With the layer built in, `body` is `isolate`. Otherwise `body`'s own background would paint over a layer below z-index 0. Since PF-008 every home section is see-through, so the canvas shows behind the whole home page (see "DOM sections over the canvas" in "Native scroll" below). The header and the footer stay solid.

The order of events:

1. **After hydration, the cheap checks**, all synchronous: the `?tier=` override (only where allowed), simple view, reduced motion, data saver, the session's context-loss and low-tier-failure flags, a failed chunk, then a WebGL 2 probe on a throwaway canvas (no WebGL 2, a software renderer). Any static trigger ends here: no canvas and no download (see "Static triggers" in §2). The order and the override's bypasses are one pure function, `decideTier` in `src/lib/journey/tiers.ts`.
2. **The start tier** goes into the tier store. The chunk is then imported only when three things hold: the `load` event has fired, the browser is idle (`requestIdleCallback`, 2 s timeout) and the page has a see-through section. So `/work` and `/resume` never download it, and a client navigation to `/` loads it then. The chunk is `src/components/journey/scene/journey-canvas.tsx` with three.js and React Three Fiber, and since PF-008 the scroll spine with gsap, ScrollTrigger and Lenis, and the camera rig (the bundler splits them into several files; `npm run size` sums them). It is a plain dynamic `import()`, so a failure is caught: static tier, no error overlay.
3. **The canvas** renders the scene and fades in.

Performance marks: `journey:checks`, `journey:decided` (the tier is in the store), `journey:chunk-request`, `journey:chunk-loaded`.

**What a static visitor downloads.** Before the decision the page has loaded only the first-load JS of the route (the loader itself is a small chunk `next/dynamic` requests after hydration; it holds the tier rules, the probe and the tier store) plus the document, stylesheet and fonts. The probe creates two throwaway WebGL contexts at most, which download nothing. three.js, React Three Fiber and the scene are never requested. `e2e/journey.spec.ts` prints the resource list up to `journey:decided` as `[journey detection]`.

**The home sections are the canvas's windows.** `HeroSection` passes its backdrop (the Port still and its scrims) to `TierBackdrop` (`src/components/journey/tier-backdrop.tsx`); since PF-008 every `SectionBanner` does the same with its chapter's still:

- In the static tier it draws the backdrop: on a `bg-background` box, the stage 1 hero (eager, high priority) and banners (lazy).
- Before the tier is known (server render, hydration) and on every render tier, the backdrop sits inside `<noscript>`. Browsers with JavaScript never parse it, so the still is not even downloaded. Browsers without JavaScript draw it exactly as in stage 1.
- The tier backdrop registers its section (the nearest `[data-chapter]`) with the view store: mounted (the chunk may load) and intersecting (the canvas may render).

In a static tier caused by a trigger, the still therefore starts loading just after hydration, not with the HTML (in previews; production is unchanged).

**Renderer** (STANDARDS §4, D-14, D-29). WebGL 2 through three's `WebGLRenderer`, via React Three Fiber's `<Canvas>`:

- sRGB output and `NeutralToneMapping` (Khronos PBR Neutral, provisional until PF-011);
- `alpha: false`, cleared to `background`;
- no shadows;
- antialiasing on the high and medium tiers. It is fixed when the context is created, so it follows the start tier;
- the pixel ratio capped per tier: 2 / 1.5 / 1;
- `powerPreference: "high-performance"` for visitors (owner decision on PF-007): on a dual-GPU machine the browser may use the discrete GPU. `?gpu=low-power` asks for the integrated, low-power GPU instead. It is a testing override like `?tier=`: honoured only where `JOURNEY_TIER_OVERRIDE` is on, never on the production deployment (`chooseGpuPreference` in `tiers.ts`, unit-tested). The numbers script and review:shots always add it, so D-40 benchmarks stay on the reference laptop's integrated AMD Radeon. The WebGL probe asks for the same preference, so it reads the renderer the canvas will get. The preference is fixed when the context is created.

**The test object** (`scene/test-object.tsx`) is plumbing, not a look. It is a bevelled chip in `surface` (PBR, metalness 0.45, roughness 0.45) with one trace-amber emissive strip, a hemisphere fill and a cool directional key (2 lights). Colours come from `src/styles/palette.ts`.

It sits outside the text-safe area (`scene/layout.ts`, unit-tested), placed for the port's camera pose (8 m from it, vertical FOV 35°: `PORT_REFERENCE`) since PF-008 – the camera now travels, and the object stays where the port stop frames it whatever pose the page was loaded at:

- **wide:** centred at 75 % of the width and spanning at most 55–95 %. The hero copy column can reach ~52 % on a 4:3 window;
- **portrait:** centred at 70 % of the height and spanning at most 55–85 %.

`e2e/journey.spec.ts` projects its bounding sphere to the screen and checks it never overlaps the hero copy's line boxes at six desktop sizes and on the phone. It prints `[object bounds]`.

The canvas clears to `background`, so the hero copy stands on the background colour or, since PF-008, on a stand-in marker pillar (unlit `surface-raised`). Its pairs are in `src/styles/contrast-pairs.ts`. The status chip and the links stand on their own surfaces. Along the whole port chapter the camera only moves forward, left and up and turns left, which carries the object further right and down on screen; `e2e/scroll.spec.ts` checks its bounds against the visible hero copy at the port's start, middle and end (`[object bounds]`).

The object owns its geometries and materials and disposes them in its own effect cleanup. That cleanup runs before R3F releases the renderer, so three.js frees their programs while it still tracks them. R3F disposes removed objects later, on idle, after its renderer teardown.

**Frame loop** (`FrameDriver` in `journey-canvas.tsx`, bookkeeping in `scene/frame-loop.ts`). It takes over rendering (`useFrame` priority 1) and draws once per frame. It measures the frame interval and the frame's CPU time and feeds the downgrade monitor. It allocates nothing, reads no layout and sets no React state. Rare events leave the loop through a timer: the first frame, a downgrade, a low-tier failure, a finished sample.

**Pause rules** (STANDARDS §4). Frames are rendered only while both hold:

- the page is visible (Page Visibility);
- a see-through section intersects the viewport (IntersectionObserver on each home section).

Otherwise R3F's loop is set to `"never"`. On `/work` after a client navigation the canvas is fully covered: no frames, and the host fades out. (Since PF-008 every home section is see-through, so on `/` the canvas renders wherever the page is scrolled.) On resume the downgrade monitor starts over, because the first interval spans the pause. The tests count frames through `window.__journey.frames`.

Next.js 16 with Cache Components keeps the previous route's DOM mounted but hidden (React `<Activity>`, `display: none`) so that Back is instant. On a case study the home sections therefore still exist, hidden: they do not intersect the viewport (the canvas stays paused), and the scroll spine starts only on sections that are actually shown (below).

**Context loss.** `ContextLossWatch` in `journey-canvas.tsx`:

- **First loss in a session:** it calls `preventDefault()` so the browser may restore the context. three.js re-uploads the scene on `webglcontextrestored`.
- **Second loss, or no restore within 5 s:** the session goes static for good. The count is kept in sessionStorage (`journey-context-losses`).

**Disposal.** Turning simple view on (or any later static trigger) unmounts the canvas. R3F then disposes the scene, disposes the renderer and forces the context to be lost. `window.__journey.lastRelease` records what the renderer still holds after that. The e2e test requires geometries, textures and programs all at 0, and the context lost.

**Dev tuning panel and performance overlay** (STANDARDS §5). `scene/dev-tools.tsx` holds a leva panel over the test object's tunables (`scene/test-object.tuning.ts`): rotation speed, emissive intensity, key and fill light. Its "Export values" button copies them as JSON and logs them to the console. It also renders r3f-perf's `<Perf />`, at the bottom right.

Placement: leva's own panel is fixed at the top right, where it covered the end of the desktop navigation (Resume, the Simple-view switch). `DevPanel` (same module) mounts the panel itself as `<Leva titleBar={{ position }} />` (a mounted `<Leva>` replaces the panel leva would add on its own), portalled to `<body>` because the canvas host is `aria-hidden`, behind the page and takes no pointer events. The position moves it down by the header's bottom edge, measured once, so it starts 10 px below the header. The hero copy sits in the left column, so at 1440 × 900 and 1920 × 1080 the panel covers no navigation and no hero text. It can still be dragged by its title bar.

These are present only in builds where `JOURNEY_DEV_TOOLS` is "on": `next dev`, and builds with `ENABLE_DEV_PAGES=1`, which is never set on Vercel. Elsewhere the import is dead code. `npm run size` searches the built chunks for both packages and fails if found.

They show at once under `next dev`. In an `ENABLE_DEV_PAGES=1` build they show only with `?tune` in the URL. A machine whose `.env` sets that flag builds every local build with it, and the panel would otherwise cover the header in tests, captures and frame-time numbers.

**Debug hooks.** `window.__journey` (`src/lib/journey/debug.ts`) exists only where the override is allowed. It offers the store state, frames, first-frame flag, scene stats (including the canvas context's renderer and `powerPreference`), frame sampling, the object's screen bounds, the last release, a `loadMs` busy-wait for forcing a downgrade in tests, and `simulatedFrameMs`: when above 0, the downgrade monitor sees that interval instead of the measured one, so a test can make frames look slow without slowing the machine (the low-tier failure test uses it). PF-008 adds `scroll()` (the scroll store plus the measured boundaries, section tops, scroll padding and maximum), `rig()` (the path's frame range and chapter starts, the frame shown and aimed at, the camera's position, rotation and FOV), `setExtraScroll(chapter, vh)` (what the panel does) and `renders` (React renders per journey component).

**Numbers script** (`npm run numbers -- <ID> [stops…] [--headless]`, `scripts/numbers.mjs`, STANDARDS §8). It builds and serves the site, then opens full Chromium on the real GPU, headed by default (the review:shots launch method, never the headless shell). Each stop in `NUMBER_STOPS` (`scripts/review/targets.mjs`: `/`, and since PF-008 every chapter stop `<chapter>:start|mid|end`; by default `port:start`, each chapter's `mid` and `uplink:end`) is loaded with `?tier=high`, `medium` and `low`, plus "medium (throttled)": high with CDP CPU throttling 4×. Each of these measured runs adds `?gpu=low-power` (D-40: the integrated GPU). One more run, "visitor default (high-performance)", loads `?tier=high` without it: information only, not judged against a budget, so the report shows which GPU a visitor's canvas gets on this machine. After a 3 s warm-up it samples 10 s and records:

- draw calls, triangles, geometries, textures and the estimated texture memory;
- frame interval and CPU time, p50 / p95 / p99;
- the tier actually active and the pixel ratio;
- the `powerPreference` the canvas context was created with and the renderer it actually got (read from the canvas's own context);
- the chapter and the progress the stop landed on (PF-008).

It writes `.review/<ID>/numbers.json` and `numbers.md` with the WebGL renderer (hardware or software), the visitor-default run's renderer and whether it is the same GPU, and the machine: `Win32_ComputerSystem` manufacturer and model, CPU, memory, `Win32_VideoController` names. It warns loudly if the measured runs' renderer does not name AMD (D-40: the reference laptop is measured on its integrated Radeon).

Headed Chromium paces animation frames to the display, so the frame intervals are vsync-capped: multiples of the refresh interval. The CPU time per frame shows the headroom under that cap.

### Native scroll (PF-008)

The page has its real height and the browser scrolls it. Nothing blocks or takes over wheel, touch or keyboard scrolling. Everything in this section runs only where the 3D layer is built in (not the production deployment, D-39), only in a non-static tier, and only on the home page. Everywhere else – other routes, the static tier, reduced motion, simple view, production – scrolling is the browser's own: no smoothing, no spine, no chapter mark, and the nav links are plain anchors.

**The scroll spine** (`src/components/journey/scroll/scroll-spine.tsx`) is part of the lazy journey chunks: gsap, ScrollTrigger and Lenis load with three.js after the page is interactive, never in a route's first-load JS. JourneyCanvas renders it next to the canvas, and it re-runs on every client navigation (`useGSAP` from `@gsap/react` with the pathname as dependency, `revertOnUpdate`). It starts only when every chapter's section is there **and shown**: Next.js keeps the previous route's DOM mounted but hidden for an instant Back, so on a case study the home sections exist, invisible (sections present but hidden are polled for up to 60 frames, for the commit that shows them again).

On the home page it:

- creates one ScrollTrigger over the whole page (start 0, end `"max"`). Its `onUpdate` turns each scroll tick into `progress`, `chapter` and `chapterProgress` in the scroll store; its `onRefresh` re-measures the sections. A ResizeObserver on `<body>` (fonts, images, extra scroll lengths, anything that changes the page's height) asks for a refresh; a window `resize` (a phone's address bar, a rotation) re-measures at once.
- starts Lenis where the primary pointer is fine (mouse, trackpad – `src/lib/journey/scroll-mode.ts`), driven by gsap's ticker (`lenis.raf`), with `ScrollTrigger.update` on each Lenis scroll, the integration the installed Lenis documents;
- extends each chapter's section by its extra scroll length (registry, below), as `padding-bottom: calc(n * 100svh)`;
- turns clicks on same-page links to a chapter section into smooth jumps (below);
- publishes the current chapter for the navigation.

Its teardown undoes all of it: the trigger killed, Lenis destroyed (its listeners and the `lenis` class on `<html>` removed), gsap's ticker restored, extra heights and added `tabindex` removed, the chapter cleared.

**Smoothing: Lenis by default.** Lenis 1.3.28 smooths wheel input only (`smoothWheel: true`, `syncTouch: false`, `wheelMultiplier: 1`, `allowNestedScroll: true`, `anchors: false`, `lerp` from `scroll.tuning.ts`, 0.1 by default; its stylesheet is not used). It moves the page by exactly the wheel's delta (pixel-mode wheels: Chromium, Safari; Firefox's line-mode deltas use Lenis's own line height of 16.7 px), toward the same end position, never snapping. Keyboard (arrows, Page Up/Down, Space, Home, End), the scrollbar, find-in-page and touch stay native; Lenis follows those native scrolls. Measured (`e2e/scroll.spec.ts`): four wheel notches of 120 px move the page 480 px with Lenis and 480 px natively.

Touch-first devices (coarse primary pointer: phones, tablets) get no Lenis: touch keeps native momentum scrolling, and Lenis would add non-passive touch listeners to the page.

**`?smooth=off`** (testing and comparison; honoured only where `JOURNEY_TIER_OVERRIDE` is on, never on production): no Lenis, native scrolling everywhere. Wherever Lenis is not running (this override, touch-first devices) the camera eases toward the scroll position instead: a critically damped spring integrated exactly (`src/lib/journey/damping.ts`), so the result after a given time does not depend on the frame rate (unit-tested at 30, 60, 144 and 240 fps). Its stiffness is `scrollTuning.cameraDamping` (6 rad/s). Like the other overrides it is read from the address the visit was loaded with and kept for the session (see "Overrides" in §2).

**Smoothing decision (owner, PF-008 follow-up 1).** The owner tried both modes on the preview and both feel good. Lenis stays the default on fine pointers; `?smooth=off` stays a preview-only testing override (never honoured on the production deployment). No behaviour changed.

**Listeners.** Every scroll, wheel, touch and key listener the site adds is passive or never calls `preventDefault`, except Lenis's own wheel handler while Lenis runs (it moves the page itself). The spine's own listeners: a passive window `resize`, a passive `scrollend` while a native smooth jump runs, and a capture-phase `click` on the document (it cancels only the click's navigation to a chapter anchor). ScrollTrigger registers only passive listeners (`wheel`, `scroll`, `touchstart`, `touchcancel`). Lenis registers on `window`: `wheel`, `touchstart`, `touchmove`, `touchend` with `passive: false`, plus `scroll`, `scrollend` (capture), `pointerdown` and `resize`. Of these only the wheel handler calls `preventDefault`; with `syncTouch` off its touch handlers return before it. `e2e/scroll.spec.ts` wraps `addEventListener` and `Event.prototype.preventDefault` before any page script runs, drives wheel, keys (and touch gestures on the phone project), and requires no `preventDefault` at all with `?smooth=off` and on touch, and only Lenis's wheel handler with Lenis on (prints `[listener audit]`).

**Jumps.** In the non-static tiers a click (or Enter) on a same-page link to a chapter section – the navigation's `/#about` …, on any query – scrolls there smoothly (Lenis `scrollTo`, or the browser's smooth scroll with `?smooth=off` and on touch), lands at the chapter's start (the section's top just below the fixed header, the browser's own anchor landing via `scroll-padding-top`), updates the URL with `history.pushState(null, "", "#about")` (Next.js's documented integration) and moves focus to the section (`tabindex="-1"` added for the jump, removed with the spine). The links stay real anchors: without JavaScript and in the static tier they are plain anchor links. Under reduced motion the static tier applies (PF-007), so a jump is the browser's instant anchor jump; the spine itself also jumps instantly when reduced motion is on.

**Deep links and return.** A cold load of `/#about` lands where the browser puts the anchor; the spine measures and the store is right from its first update. A client navigation to `/#about` (Next.js scrolls to the hash) starts the spine on the new page the same way. Back from a case study: Next.js shows the kept home page again and the browser restores the scroll position; the spine starts there. A reload keeps the position (the browser's scroll restoration). In each case the camera snaps to the pose for that position (the store's epoch, below): no fly-through from the start. With extra scroll lengths set, a deep link lands again on its chapter's start after they are applied.

**DOM sections over the canvas.** In the non-static tiers every home section is see-through: the canvas shows behind the whole home page. Each banner's still goes through `TierBackdrop`: not rendered (inside `<noscript>`, never downloaded) on a render tier, drawn as in stage 1 in the static tier. The banner box stays (its aspect ratio is the canvas's window) with the label and h2 at its foot. While the canvas is mounted (`<html data-journey-canvas>`, set by JourneyCanvas) the heading's strip and the section's content stand on the **canvas scrim**: `canvas:canvas-scrim`, the background colour at 90 % (`@utility canvas-scrim` and `@custom-variant canvas` in `globals.css`). `src/styles/contrast-pairs.ts` proves every text colour on it at ≥ 4.5:1 against the worst case behind it, pure white – the brightest pixel the canvas can output at all – so the proof holds for any scene a later chapter brings (`contrast.test.ts` also keeps the stylesheet's 90 % equal to the value the proof uses). The hero keeps PF-007's arrangement without a scrim (see "The test object" above). The footer is opaque in builds with the layer. The static tier and production render the stage 1 sections exactly (unit-tested in `journey-switch.test.tsx`).

### One source of truth for progress (PF-008)

`src/lib/journey/scroll-store.ts`: a vanilla zustand store beside the tier store, written only by the spine. The frame loop reads it with `getState()`; nothing re-renders through React while the page scrolls (`e2e/scroll.spec.ts` counts the renders of every journey component – `window.__journey.renders` – across a full scroll down and up and requires no change).

| Field | Meaning |
|---|---|
| `progress` | `scroll position / (document scroll height − viewport height)`, clamped: exactly 0 at the top and exactly 1 at the bottom (within half a pixel of a fractional end); 0 on a page that does not scroll (`scrollToProgress`, `src/lib/journey/scroll-math.ts`) |
| `chapter`, `chapterIndex` | the chapter the scroll position lies in |
| `chapterProgress` | 0–1 within that chapter |
| `active`, `mode` | the spine runs on this page; `lenis` or `native` |
| `epoch` | bumped whenever the spine starts on a page (a cold load, a deep link, a return): the camera snaps instead of easing |

**Chapter boundaries come from the measured DOM sections** (`chapterBoundaries`, `locateChapter`): chapter *i* starts where its section's top meets the bottom of the fixed header (`top − scroll-padding-top`, which is where the browser's own anchor jump lands; the first chapter at 0), and runs to the next chapter's start, the last one to the page end. A position up to 1 px before a boundary counts as the next chapter, so a jump that lands on a whole pixel stays in the chapter it aimed at. All of it is recomputed on every ScrollTrigger refresh. Unit-tested (`scroll-math.test.ts`: the ends, clamping, zero height, fractional ends, extra lengths); `e2e/scroll.spec.ts` checks the ends at 360 × 780, 390 × 844, 1440 × 900 and 1920 × 1080, after a resize and a phone rotation, and that the boundaries equal the sections as loaded, after a resize and with extra scroll lengths (`[scroll ends]`, `[chapter boundaries]`).

**The navigation's current chapter.** The store is in the lazy chunk, the navigation in every page's first-load JS, which on production must not carry journey code. So the spine mirrors the chapter's section id onto `<html data-journey-section="about">` and fires `journey:chapter` on `window` on each change (`src/lib/journey/chapter-bridge.ts`); `useJourneyChapter()` (`src/components/journey/gate.tsx`, compiled only where the layer is built in) reads it with `useSyncExternalStore`, so the navigation re-renders on a chapter change only. The link of that section is `aria-current="location"` (the page's own link stays `aria-current="page"`), shown in full text colour with a trace-accent underline (not colour alone; `Link`'s `nav` variant, those classes only in builds with the layer). A section's link is its anchor (`/#about`) or a page of the same name: during the projects chapter (section `work`, chapter `array`) "Work" is marked the same way, and its href stays `/work` (PF-008 follow-up 1; both Work links in the header – the quick link below `lg`, the list entry from `lg` – carry it, as both carry `aria-current="page"` on `/work`). The hero (`port`) has no link, so nothing is marked there. Static tier and production: unchanged, nothing is marked.

### Chapters are modules (PF-008)

`src/lib/journey/chapters.ts` is the one chapter registry, in BRIEF §3 order (D-24): `port` (#top), `bus` (#about), `memory` (#experience), `array` (#work), `core` (#skills), `uplink` (#contact). Each entry has its id, its section id, its extra scroll length (viewport heights, default 0, added as extra section height only in the non-static tiers), its path marker (`CH_<id>`) and a tuning object for the chapter's own values. Boot (PF-012) is not a scroll chapter. `chapters.test.ts` keeps the registry equal to BRIEF §3 and to the content's home sections. The extra scroll lengths and the smoothing values (`scroll/scroll.tuning.ts`) are in the dev tuning panel ("Scroll (PF-008)", leva, dev-only) with Export values.

**The camera rig** (`src/components/journey/scene/camera-rig.tsx`, `path-asset.ts`) plays the journey camera path of the asset contract (STANDARDS §6) from one fixed folder, `public/assets/world/` (`JOURNEY_PATH_DIR`; PF-009 kept it: the path is not a pipeline asset):

- `world-path.glb`: the camera is found by name (`CAM_journey`, else the first perspective camera, with a development warning), the clip by name (`journey`, else the first). three's `GLTFLoader` parses it; every transform track of the clip is sampled through its own interpolant (linear, slerp, glTF cubic spline), so whatever the exporter animates (the camera node or its parents) moves the camera.
- `world-path.json`: `{ fps, firstFrame, lastFrame, markers: { CH_port: n, … } }`.

**Marker mapping** (`src/lib/journey/path-mapping.ts`, unit-tested): inside chapter *i*, `chapterProgress` maps linearly to the frames between `CH_<i>` and the next chapter's marker; the last chapter runs to `lastFrame`. So the camera reaches each chapter's marker exactly when its DOM section starts. Missing markers (a development warning) and markers out of order or outside the frame range (a development error) fall back to even spacing over the whole range. A frame becomes clip time from the clip's first key (`clipStart + (frame − firstFrame) / fps`), so it does not matter whether the exporter starts the keys at 0 s or at `firstFrame / fps`.

Each frame (priority 0, before the render): the frame for the store's chapter and progress, eased or not (above), the clip sampled at that time, and the animated camera's world transform (position and rotation) and vertical FOV, near and far copied to the scene's camera. Nothing is allocated. On a window resize React Three Fiber updates the aspect and the vertical FOV stays: phone framing is PF-010's decision. The canvas draws its first frame only once the path is settled, so a mid-page arrival shows the right pose from the first frame. If the files cannot be loaded the camera keeps the port pose (a development warning).

**Replacing the path needs no code change.** `src/components/journey/scene/path-swap.test.ts` loads the committed stand-in and a second generated pair (other fps, frame range, time origin, position, length and markers) and checks that the camera reaches each pair's own markers and last frame; `e2e/scroll.spec.ts` serves the second pair in place of the files and checks the rig's frame range, chapter starts and pose in the browser (`[path swap]`).

**The stand-in path** (until PF-010): `npm run path:standin` (`scripts/make-standin-path.mjs`) writes both files – a slow 12 s glide, 30 fps, unevenly spaced markers – see `docs/assets.md`. The six stand-in markers (`scene/standin-markers.tsx`) are dark pillars, one per chapter, placed from the path itself ahead of and to the right of each chapter's start pose: one instanced mesh, unlit `surface-raised`. Plumbing, not a look; PF-010 replaces both with the Blender path and the grey-box world.

**Review and numbers stops.** `npm run review:shots` and `npm run numbers` take chapter stops `<chapter>:start|mid|end` (`scripts/review/targets.mjs`): start = the chapter's start + 1 px, mid = halfway to the next start, end = the next start − 1 px (the page end for the last), resolved from the live registry and the measured sections at capture time (`window.__journey.scroll()`), after the camera has arrived. Both keep `?gpu=low-power` and the real-GPU checks. The numbers record the chapter and progress of each stop.

### Assets: loading, the contract, disposal (PF-009)

Blender exports become site assets through the asset pipeline (`npm run asset`, see [assets.md](assets.md)): `public/assets/<chapter>/<slug>/<slug>-high.glb` and `-low.glb`, listed in the generated, typed manifest `src/lib/journey/assets/manifest.generated.ts`. Everything that loads them is journey code: in the lazy 3D chunk, never in a route's first-load JS, and absent from a production build (D-39).

**Decoders served by the site** (STANDARDS §4). `src/components/journey/assets/decoders.ts` builds one glTF loader per renderer: three's `GLTFLoader` with `KTX2Loader` (transcoder path `/decoders/three-r<REVISION>/basis/`, GPU formats chosen by `detectSupport(renderer)`) and the Meshopt decoder, imported at runtime from `/decoders/three-r<REVISION>/meshopt_decoder.module.js` (`import(/* webpackIgnore: true */ url)`, honoured by Turbopack, so the file in `public/` is the one three.js ships). `REVISION` comes from the same three.js the code is built with, and `npm run decoders` copies the files from it before every build into that folder (git-ignored), so the decoder can never be from another version. The Zstandard decoder (UASTC textures) is part of three's KTX2Loader module, inside the chunk. The decoders are created on the first asset load only: a page that loads no asset requests none of them. KTX2Loader's own default path (`new URL(…, import.meta.url)`) makes the bundler emit a second copy of the transcoder into `.next/static/media/`; it is never requested (`npm run size` lists it). The transcoder runs in workers made from `blob:` URLs; the browser contacts no host but the site (`e2e/assets.spec.ts` records every request).

**The contract, applied** (`src/components/journey/assets/contract.ts`, `applyAssetContract`; the name rules are shared with the pipeline in `src/lib/journey/assets/contract-rules.ts`):

| In the export | On the site |
|---|---|
| `BAKED_<set>` material | `MeshBasicMaterial` with the baked image as its map (sRGB, tone-mapped like the rest): unlit, because the bake already holds the lighting (Blender question 1). The loaded standard material is disposed |
| `PBR_<name>` | the loaded `MeshStandardMaterial`, lit by the scene's runtime lights (≤ 2, D-16) |
| `SHADER_<name>` | the shader library's material of that name (below); per mesh |
| unknown `SHADER_` name | development (`next dev`, dev-tools builds): a loud console warning and an amber wireframe; production: a plain dark `surface` material, silently |
| `GLOW_<name>` | unlit `MeshBasicMaterial`, colour = emission × strength; tagged for PF-011's bloom: `material.userData.bloom = true` and the mesh on `BLOOM_LAYER` (layer 1, besides layer 0 – it still renders normally; the bloom pass will render layer 1 alone) |
| `ANCHOR_` / `HOTSPOT_` / `GLOW_` empties | points with world positions in the registries (`src/lib/journey/assets/points.ts`: `listPoints("hotspot")`, `findHotspot("HOTSPOT_slot_03")`) – plain numbers in a vanilla store, so DOM code can attach content to a hotspot without three.js; no light is created at a glow accent yet |
| `INST_<prop>_<nnn>` empties | one `InstancedMesh` per prop drawing the mesh `<chapter>_<prop>` at each empty's transform (× the source's own quantization transform); the source mesh is removed, never drawn in place |
| clips | one `AnimationMixer` per asset; every action plays, paused (`LoopOnce`, clamped). `scrub(p)` sets each action's time to p × its duration and updates the mixer by 0 – forwards and backwards, exact, no allocation, no `finished` event |

A mesh that quantization moved onto an unnamed child node (an animated node, see the pipeline) reports its parent node's name.

**Shader library** (STANDARDS §4: one library, each shader with a low-tier variant and documented uniforms). `src/components/journey/assets/shaders/library.ts` maps names to definitions (`description`, `uniforms` documentation, `create({ source, mesh, tier })`); the names are listed in `src/lib/journey/assets/shader-names.ts`, which the pipeline reads to warn about unknown names (`library.test.ts` keeps the two equal). One shader so far, `test_grid` (`shaders/test-grid.ts`): it reads the `COLOR_0` mask – green = border → trace amber, red 0 → 1 → a brightness ramp – and draws a signal-cyan line where red is exactly 0.5 and a notch in the border at the panel's geometric centre (from its bounding box). The line runs through the notch: the mask arrives linear (Blender question 3; sRGB-encoded red would put the line 0.17 m to the right). Low tier: the same without derivatives. The shader ends with three's tone-mapping and colour-space includes, like every other surface.

**Per-chapter loading** (STANDARDS §1). `src/lib/journey/assets/chapter-plan.ts` (pure, unit-tested): the registry groups the manifest by scroll chapter; the current chapter's assets load first, then `ahead` chapters' (preload, default 1); a chapter more than `keep` chapters behind or ahead (default 1) is unloaded; one just behind stays if loaded but is not fetched for it. `shared` assets belong to no chapter and load only when asked for. Both numbers are in the dev panel ("Assets (PF-009)", Export values). `ChapterAssets` (`assets/chapter-assets.tsx`, inside the journey canvas) subscribes to the scroll store's chapter and the tier store (no React render) and hands the plan to an `AssetManager`. Until PF-010 no manifest entry belongs to a scroll chapter, so the home page loads nothing and requests no decoder (`e2e/assets.spec.ts`). Tiers: high and medium load `-high`, low loads `-low`, static loads nothing (`variantForTier`); a variant change reloads.

**The manager** (`assets/asset-manager.ts`): `load(entry, variant)` streams the file (`fetchWithProgress`), parses it, applies the contract, adds the root under its parent and registers the points; `unload(key)` cancels a running load or disposes the asset; `sync(wanted, variant, unload)` loads in order, one at a time, skipping what is no longer wanted when its turn comes. Failures are recorded (`failed`), never thrown.

**Loading progress** (for PF-012's boot). `loadingStore` in `src/lib/journey/store.ts`, beside the tier and view stores: per asset `{ loaded, total, state }` and the sums; `loadingFraction()` is 0–1 (1 when nothing is wanted). `loaded` counts the bytes as they stream in (one update per chunk); `total` is the manifest's file size, entered as soon as an asset is wanted, so the overall figure covers everything wanted before a byte arrives. A finished asset's total becomes the bytes that really arrived; an unloaded one leaves the store. `window.__journey.assets()` shows it with the loaded and wanted keys.

**Disposal.** `dispose()` frees every geometry, material (originals and replacements) and texture (maps and shader uniforms) of the asset, the instance buffers and the mixer's caches, and removes the asset from the scene. The renderer's memory counters return to their baseline (unit test with a counter that mirrors three's `WebGLGeometries`/`WebGLTextures` accounting; `e2e/assets.spec.ts` with the real renderer, twice in a row). One texture is the renderer's, not an asset's: three r187 uploads a shared `DFG_LUT` lookup texture the first time any lit material renders and keeps it. The journey canvas has it from its first frame (the test object is lit); the asset lab warms the renderer with one lit draw before reading its baseline.

**The asset lab** (`/dev/assets`, `src/app/dev/assets/`, dev-pages builds only): `shared/pipeline-test` through the same manager, with OrbitControls, a clip scrubber, the tier switch, load / unload, DOM labels at the projected anchors, hotspots and glow accents, an "unknown shader" switch, and readouts (meshes by kind, instances, points, the renderer's memory and render counters, texture memory against RGBA8, the progress signal). Its three.js code is a lazy chunk (`asset-lab-loader.tsx`), so the route's first-load JS has none. `window.__assetLab` drives it in tests and captures.

**Measured (PF-009, reference laptop's integrated AMD Radeon, `?gpu=low-power`).** `pipeline-test` high: 5 draw calls, 1 120 triangles (982 authored; the four pins are one instanced draw), 2 KTX2 textures transcoded to 1.75 MB of GPU memory (6.99 MB as RGBA8 with mips); low: 512² and 256² textures. Raw export 348.6 KB → `-high` 296.5 KB, `-low` 123.1 KB.

- **The lazy journey chunk:** still one file, 348.9 KB gzip (289.3 KB Brotli, 1 218.8 KB raw; limit 400 KB), +36.5 KB over PF-008's 312.4 KB: KTX2Loader with its Zstandard decoder, the contract code, the shader library, the manager and the chapter assets. First-load JS of `/`: 161.8 KB gzip with the layer (PF-008: 161.6).
- **Decoders** (not in the chunk; requested on the first asset load only): Basis transcoder JS 15.2 KB + WASM 247.6 KB gzip (527.3 KB raw), Meshopt decoder 7.8 KB gzip.
- **Production build** (`VERCEL_ENV=production`): `public/decoders/` removed, no transcoder emitted, the asset loaders in no file; the 103 prerendered files are identical to main's apart from hashes and build ids (two `.rsc` files differ only in Next's per-build dynamic-parameter placeholder).

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

The email: to the public address in `identity.email`, from `CONTACT_EMAIL_FROM` – the verified domain's sender, set by the owner in Vercel and `.env.local` (D-36) – or, when it is missing or blank, Resend's test sender `Portfolio <onboarding@resend.dev>` (`contactSender()` in `src/config/contact.ts`, tested), reply-to the visitor, subject `[Portfolio] <intent> – <name>`, plain text and a simple HTML version (everything the visitor typed escaped) with intent, each detail, name, email, time (IST and UTC) and message. Labels in `ui.transmissionEmail`. Settings in `src/config/contact.ts`; env names in `.env.example`.

**Validation, twice, one set of rules.** The browser checks each step with small hand-written rules (`src/lib/contact/checks.ts`: name 1–100 characters on one line, an email address by zod's own pattern ≤ 254, message ≤ 2,000) to keep zod out of the client bundle (it cost ≈ 15 KB gzip); the endpoint runs the same rules as zod schemas (`src/lib/contact/submission.ts`, server only). `submission.test.ts` proves both give the same verdict on a table of inputs.

**Limits of the spam protection (best-effort, D-33).** No third-party captcha, no extra account.

- Rate limit: 5 submissions per client IP in any 10 minutes, counted **in memory per server instance**. On Vercel every serverless instance counts on its own and a cold start forgets the counts, so the real limit can be several times higher during a burst. The IP comes from `x-real-ip` / `x-forwarded-for`, which Vercel sets; on other hosts these headers can be forged. If spam gets through, a shared store (Upstash Redis) is the next step – a new account, so an owner decision.
- Minimum time: measured by the flow's script, so it only applies to JavaScript submissions. The plain form (no JavaScript) cannot measure time and sends no value; it is covered by the trap field and the rate limit only. A bot that posts the plain form directly skips the timer. **Accepted by the owner (2026-11-23):** this gap stays; the trap field and the rate limit cover the plain form.
- Trap field: catches bots that fill every field; not bots that read the page's CSS or accessibility tree.

## 2. Quality tiers and fallbacks

### Tiers: high, medium, low, static
The tier lives in one small store: `src/lib/journey/store.ts`, vanilla zustand. The frame loop reads it with `getState()` and never causes a React render. It holds the tier (`pending` until the checks run, then `high`, `medium`, `low` or `static`), the reason, whether `?tier=` forced it, and the history of changes. All the rules are pure functions in `src/lib/journey/tiers.ts`, unit-tested with the signals as input. The browser reads in `src/lib/journey/signals.ts` are each guarded, so a missing API reads as "no signal".

| Tier | Pixel ratio cap | Frame-time p95 limit | Today (PF-007) |
|---|---|---|---|
| high | 2 | 16.7 ms | the test object, antialiased |
| medium | 1.5 | 20 ms | the same, antialiased |
| low | 1 | 33 ms | fewer curve and bevel segments, no antialiasing |
| static | – (no canvas) | – | the stage 1 home |

Chapters (PF-008 on) state what each tier gets.

### Static tier: the stage 1 home (PF-028)
The `static` tier is the home page as it is now: no canvas, the same DOM, and Blender stills where the 3D scene will be. It is also the stage 1 launch page (D-26), so none of it is throwaway. The hero stands on the Port still. Every other section opens on a banner of its chapter's still (Bus, Memory Banks, Render Array, Core, Uplink), with the mono index label and the h2 in the banner's bottom-left corner. The stills are encoded by `npm run media:stills` and listed in `docs/assets.md` and `src/content/data/stills.ts`.

**Art direction.** Each still comes in two crops and is drawn with `<picture>`, using the installed Next.js's documented way: `getImageProps()` for each crop, the wide crop as a `<source media>`, the portrait crop on the `<img>` (`src/components/stills/still-picture.tsx`). next/image serves each crop resized per device (AVIF, else WebP, quality 75, `sizes="100vw"`).

| | Wide crop | Portrait crop | Switch |
|---|---|---|---|
| Hero (`#top`) | 16:9, 2560 × 1440 | 9:16, 1080 × 1920 | `(orientation: landscape)`; the layout uses Tailwind's `landscape:` / `portrait:` |
| Banners | 21:9, 2560 × 1080, in a 21:9 box | 4:5, 1080 × 1350, in a 4:5 box | `(min-width: 48rem)` = Tailwind `md` |

The stills are decorative (`alt=""`), like the canvas they stand in for. A sized image that fails still gets a broken-image frame and icon in Chromium, even with an empty alt. Browsers generate an image's `::after` only when it failed, so each still `<img>` carries an `::after` panel in the background colour. A failed still therefore shows the background colour and nothing else; `e2e/stills.spec.ts` checks the pixels of each failed image's corner. The hero image is fetched at once at high priority, because it is the page's largest paint. Every banner is lazy. No layout shift: the hero box is the first screen (`min-h-first-screen`) and each banner box has a fixed aspect ratio (`aspect-banner-narrow`, `md:aspect-banner-wide`). Neither depends on the image. With images off or slow, every section keeps its layout and reads as text on the background colour (`e2e/stills.spec.ts` compares the section heights with and without images).

**The heading never goes with the still.** A banner's label and h2 sit in normal flow at the bottom of the box (flex column, `justify-end`), not positioned out of it, so the banner is always at least as tall as its text. The aspect ratio is a minimum: the box clips with `overflow-clip`, which is not a scroll container, so large text or 200 % zoom grow the banner instead of cutting the heading off. Only the still is clipped. On the first PF-028 Vercel preview the CSS lacked the aspect ratio (see "Builds start cold" below): the old banner, with the text absolutely positioned inside an `overflow-hidden` box, collapsed to 0 px and hid every section heading. `e2e/stills.spec.ts` now checks, with the stills blocked, with the aspect ratio removed and with simple view on, that each label and heading lies inside its banner and is what a click at the heading hits. `toBeVisible()` alone cannot tell, because a clipped element keeps its box.

**Builds start cold.** `next.config.ts` sets `experimental.turbopackFileSystemCacheForBuild: false`. Next 16.3+ keeps a Turbopack build cache in `.next/cache/turbopack`, and Vercel restores `.next/cache` from an earlier deployment. The PF-028 preview (commit 93f9d1f) served a stylesheet byte-identical to a local build of the same commit minus exactly what PF-028 added to `globals.css` (`--aspect-banner-*`, `hero-copy`, `hero-still-inset`). Its class names from the `.tsx` files were current, so the Tailwind loader had compiled main's `globals.css` against PF-028's sources. CI builds without a cache and was correct. A cold build costs a little time and always compiles from the committed files. `next dev` keeps its own cache in `.next/dev/cache`.

**Text-safe areas.** The look bible keeps the left 40 % of wide frames and the top 40 % of portrait frames calm (BRIEF §4). In the hero:

- On landscape screens the wide still covers the hero from the content column's left edge to the window's right edge, anchored left (`hero-still-inset`). The copy column (`hero-copy`, `globals.css`) starts there and is 40 % of the image's drawn width, which is the larger of the box width and the first screen's height × 16/9. So it never passes the safe area, whatever the window's shape. Text wraps inside it.
- On portrait screens name, role, pitch and place sit at the top. The availability chip and the two links stand on their own solid surfaces below the port.

On banners the label and heading stay in the bottom 38 % (wide; bottom 35 % on 4:5) and the left 70 % (wide).

The areas are in `src/styles/stills.ts` (`textArea`). `e2e/stills.spec.ts` maps the text's line boxes through `object-fit: cover` and `object-position` into image fractions at nine window sizes, from 360 × 780 to 2560 × 1440 plus a landscape phone. It requires every text box inside its area and the right crop at each size.

**Scrims.** A scrim is a gradient of the background colour over the image, from transparent to an alpha, defined in `src/styles/stills.ts` and drawn by `src/components/stills/still-scrims.tsx` as `color-mix(in srgb, var(--color-background) N%, transparent)`.

| Still | Scrims |
|---|---|
| Bus, Memory, Array, Uplink | bottom 0.72 → 0.62 at 40 % → 0 at 70 %; a top fade 0.75 → 0 at 20 % |
| Core | the strongest: its amber streets run through the lower band (max luma 194, REPORT-stills run 2). Bottom 0.86 → 0.80 at 45 % → 0 at 80 %; on the wide crop also from the right 0.40 → 0 at 45 %, where the avenue is brightest; the top fade |
| Port | left 0.60 → 0.45 at 30 % → 0 at 55 % (landscape) or top 0.70 → 0.50 at 30 % → 0 at 55 % (portrait); a bottom fade into the page, 0.85 → 0 at 18 % |

`src/styles/still-contrast.test.ts` proves 4.5:1. For every still and crop it decodes the shipped file, and the same file re-encoded as next/image serves it. It takes every pixel under the text area, lays the scrim over it as the browser blends it (sRGB), and requires each text colour that sits there (the index label's accent-trace and the heading's text; text and text-muted on the hero) to reach 4.5:1 against the brightest result.

The banners' boxes keep the image's proportions (cropped only on the side away from the text), so the test may count their scrim. The hero's box changes shape with the window, so its text must pass on the image alone. It does: 13.8:1 and 5.5:1 at worst, the scrims are extra margin. The social image's text area (left half) is checked the same way.

### Choosing and lowering the tier

**Start tier** (`chooseStartTier`), once WebGL 2 on a hardware renderer is known to be there (a software renderer is a static trigger, below):

| Signal | Start tier |
|---|---|
| a phone: coarse pointer, screen's short side < 600 px | low |
| a tablet: coarse pointer | medium |
| `navigator.deviceMemory` ≤ 4 GB, or `hardwareConcurrency` ≤ 4 | medium |
| otherwise | high |

The session's floor caps it: the tier never starts above a tier it was lowered to.

detect-gpu (the item allowed it) is **not** used. It would add a benchmark download per visit, served from the site (STANDARDS §4). And on the reference laptop Chrome reports a generic "AMD Radeon(TM) Graphics" that covers every Ryzen iGPU generation, so a benchmark lookup adds little over the frame-time downgrade, which measures the actual device.

**Lowering on measured frame time** (`src/lib/journey/frame-monitor.ts`, unit-tested):

- After a 2 s warm-up, the monitor keeps the last 120 frame intervals. Every 30 frames it takes their 95th percentile, nearest rank, sorted in place in a preallocated array, so the frame loop allocates nothing.
- When the p95 stays above the tier's limit × 1.1 for 3 s of frame time, the tier drops **one** step. The new tier's limit applies and the monitor warms up again.
- One interval is clamped at 250 ms, so a single stall cannot dominate.
- `low` is the lowest render tier. **At `low`, a sustained failure ends the canvas**: when the p95 stays above low's limit × 1.1 (33 ms → 36.3 ms) for 5 s of frame time (`LOW_FAILURE_SUSTAIN_MS`, after the same warm-up and full window), the session goes static for good (owner decision on PF-007). `failAtLow()` in the store records it in sessionStorage (`journey-low-failed`, try/catch; in memory when storage throws) and sets the static tier with the reason `low-failed`; the canvas unmounts and the hero draws its still. Every later check in the session finds the flag before probing WebGL. The × 1.1 is the same jitter tolerance as the downgrade's: at 60 Hz a device that holds 30 fps measures ~33.3 ms, which is within low's budget and must not count as a failure.
- The floor is stored in sessionStorage (`journey-tier-floor`, try/catch; in memory when storage throws). A tier never climbs back within the visit: not after the load passes, not after simple view is toggled, not after a reload in the same tab.
- A `?tier=` tier is pinned: never lowered, never ended by the low-tier failure, and it ignores the floor.

Why × 1.1: rAF intervals are quantised by the display. At 60 Hz a scene that keeps up measures ~16.7 ms with timer jitter around it. A p95 above 18.4 ms means at least one frame in twenty missed the refresh. At 60 Hz, medium's 20 ms behaves the same way (frames are either ~16.7 or ~33.3 ms), and low's 33 ms × 1.1 means frames regularly miss two refreshes. `e2e/journey.spec.ts` forces a drop by adding 60 ms of work per frame (`__journey.loadMs`). It checks that the tier goes from high to medium, stays there when the load stops, and a reload starts at the floor. The low-tier failure is tested with simulated frame times (`__journey.simulatedFrameMs = 60`, the machine is not slowed): from an automatic `low` the session goes static with the reason `low-failed`, a reload stays static without requesting the chunk, and `?tier=low` still gets the canvas. Both tests pretend a hardware GPU (an init script), since the browser under test is SwiftShader.

**Overrides** (testing, review captures, the numbers script), honoured only where `JOURNEY_TIER_OVERRIDE` is on, never on the production deployment, where the query is not even parsed:

- `?tier=static` forces the static tier.
- `?tier=high|medium|low` forces (pins) a render tier. It **bypasses** the software-renderer trigger, the session's low-tier failure, the frame-time downgrade and the session floor, so tests and CI can run the canvas on SwiftShader. It does **not** bypass "no WebGL 2" (there is nothing to render with: static, quietly, no error) nor the visitor's own choices and the other triggers: simple view, reduced motion, data saver, context lost twice, a failed chunk.
- `?gpu=low-power` asks the canvas for the integrated GPU (see "Renderer" in §1). Visitors get `"high-performance"`.
- `?smooth=off` turns Lenis off (see "Smoothing" in the scroll spine section).

`decideTier` in `tiers.ts` holds the whole order and is unit-tested for every bypass, including that nothing is bypassed when the override is not allowed.

**When the overrides are read (PF-008 follow-up).** Once per page load, from the address the document was loaded with, and kept for the session – never from the current address at the moment some code asks (`src/lib/journey/overrides.ts`, `journeyOverrides()`; used by the loader for `?tier=` and `?gpu=`, by the scroll spine for `?smooth=`).

- *Why:* the tier loader is itself a lazy chunk (`dynamic(…, { ssr: false })` in `gate.tsx`) and decides after it arrives. A hydrated header link can be followed before that: a client navigation from `/work?tier=high` to `/#about` replaces the address with one that has no query. The loader then read no override, found SwiftShader and correctly went static, so the spine never started. That was PR #9's CI failure ("deep links land on their chapter after a client navigation", desktop and phone): the failing traces show the client navigations and no request for the 3D chunk afterwards; reproduced locally by holding the loader's chunk back until after the click, when the store's only entry was `static / software-renderer`, decided at `/#about`.
- *The address the document was loaded with* is the navigation timing entry's `name` (`performance.getEntriesByType("navigation")`), which `history.pushState` does not change; where a browser has none, the current address.
- *Kept for the session:* the set is stored in sessionStorage (`journey-overrides`, JSON, validated on read, try/catch; in memory when storage throws). A later page load in the tab whose address names no override (a reload of `/#about`) keeps the stored set. A load whose address names at least one replaces the whole set with exactly what it says (`?tier=high` after `?tier=low&gpu=low-power` is just `?tier=high`). A new tab starts with none. Every Playwright test and every review:shots / numbers run uses a fresh browser context, so a set never leaks between them.
- *Production:* where `JOURNEY_TIER_OVERRIDE` is off nothing is parsed, read or written; a stored set is never consulted. A kept `?tier=` still never bypasses "no WebGL 2" or the visitor's own triggers (`decideTier` is unchanged).
- *Tests:* `src/lib/journey/overrides.test.ts` (the rule; a client navigation before the first read; a later load without a query; replacement; storage throwing; production ignores the address and the storage; "no WebGL 2" still wins). `e2e/scroll.spec.ts` "deep links land on their chapter after a client navigation" is the regression test: it holds the loader's chunk (recognised by its `journey:checks` mark) until the client navigation is done, checks the loader had not decided yet, and requires the spine and a forced `high`; then a reload of `/#skills` without the query keeps them.

### Static triggers
Each one gives the stage 1 home exactly: no canvas, no 3D chunk request, the hero still drawn, no console or page error (`e2e/journey.spec.ts`, desktop and phone). The cheap, synchronous checks run before anything is downloaded, in this order (`findStaticReason`, then the probe; `decideTier` puts them together):

| Trigger | Detected by | Remembered |
|---|---|---|
| "Simple view" chosen | `getSimpleView()` (localStorage `simple-view`) | across visits (localStorage) |
| Reduced motion | `matchMedia("(prefers-reduced-motion: reduce)")`, watched | the browser setting |
| Data saver | `navigator.connection.saveData` | the browser setting |
| Graphics context lost twice | sessionStorage `journey-context-losses` ≥ 2 | the session |
| The 3D chunk failed to load | a rejected `import()` | this page (a reload tries again) |
| Frame time failed at `low` | p95 > 33 ms × 1.1 for 5 s while on an automatic `low` (above) | the session (sessionStorage `journey-low-failed`) |
| No WebGL 2 | `canvas.getContext("webgl2")` on a throwaway canvas (released at once) | – |
| A software renderer | the same probe: the unmasked renderer (`WEBGL_debug_renderer_info`) matches SwiftShader, llvmpipe, softpipe, "Software" or "Basic Render" (`SOFTWARE_RENDERER_PATTERNS` in `tiers.ts`), or the browser refuses a context with `failIfMajorPerformanceCaveat: true` (the WebGL context attribute; three r187's `WebGLRenderer` also takes it as a parameter, default `false`, and passes it to `getContext`; the canvas leaves it off, so the probe alone makes the check) and gives one without it | – (checked on every visit) |

A trigger that fires later (the chunk fails, the context is lost twice, simple view or reduced motion turned on) unmounts the canvas. The hero then draws its still. Turning simple view or reduced motion off runs the checks again, subject to the other triggers and the floor.

### "Simple view" switch
A toggle button (`aria-pressed`) in the navigation: `src/components/layout/simple-view-switch.tsx`. The choice lives in a tiny store with no React dependency, `src/lib/simple-view.ts` (`getSimpleView`, `setSimpleView`, `subscribeSimpleView`), remembered in `localStorage` under `simple-view` (`"on"`/`"off"`). Every storage access is in try/catch, so a throwing storage keeps the choice for the visit only. Other tabs follow through the `storage` event. React reads it with `useSimpleView()` (`src/lib/use-simple-view.ts`, `false` on the server and during hydration).

"On" selects the static tier (PF-007): the canvas unmounts and everything on the GPU is freed. "Off" runs the tier checks again. PF-007 also fixed the switch's knob: two class names had run together since PF-005, so it never moved or lit up when on (regression test in `simple-view-switch.test.tsx`).

### Reduced motion
`prefers-reduced-motion: reduce` is a static trigger: no canvas, no camera travel, no smoothing, no parallax (STANDARDS §2). The loader watches the media query, so changing the setting during a visit applies at once. The stylesheet's rule stays as it was: only opacity may transition, animations stop. In the static tier nothing else moves.

### Per-chapter tier behaviour
_To be filled in._
