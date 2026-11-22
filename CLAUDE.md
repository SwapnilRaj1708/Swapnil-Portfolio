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

Import alias: `@/*` → `src/*`.

Library interfaces change. Before using any library API, check the documentation of the **installed** version (for Next.js: `node_modules/next/dist/docs/`), never memory.

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Clean install from `package-lock.json` (use this to restore dependencies) |
| `npm run dev` | Development server (http://localhost:3000) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Production build (prints first-load JS per route) |
| `npm run start` | Serve the production build (`-- -p <port>` for another port) |
| `npm test` | Unit and component tests (Vitest) – see TESTING |
| `npm run test:e2e` | Browser smoke tests (Playwright) – see TESTING |
| `npm run review:shots -- <ID> [routes…]` | Review screenshots into `.review/<ID>/` – see TESTING |
| `npm run size` | First-load JS per route against the budget – see TESTING |
| `npm run lighthouse -- [routes…]` | Lighthouse scores against the thresholds – see TESTING |

Run tools only through the project's install: `npx --no-install <tool>` or `npm run <script>`. Never a bare `npx <name>`.

CI (`.github/workflows/ci.yml`) runs on every pull request to `main`, on the Node version in `.nvmrc`: `npm ci` → typecheck → lint → build → unit tests → Playwright Chromium install (with system deps) → smoke tests → size report. The Playwright report is uploaded as an artifact only when a step fails. Lighthouse and screenshots are local only.

## TESTING

All checks run against the project's own install. Scripts that need a server start `next start` on a **free port** and stop it when done (no process is left running). Output folders are git-ignored: `.review/`, `.lighthouseci/`, `test-results/`, `playwright-report/`. `Blender Assets/` is excluded from every test, lint and capture glob.

| Command | What it checks | Output |
|---|---|---|
| `npm test` | Vitest + jsdom + Testing Library (jest-dom matchers): `src/**/*.test.{ts,tsx}`. Today: the home page renders name (only `h1`), role and pitch inside `main`; the launch switch drives robots metadata, `robots.txt` rules and the `X-Robots-Tag` header, tested for both values by mocking `@/config/site` (the real switch is never edited). `npm run test:watch` for watch mode. | Terminal |
| `npm run test:e2e` | Playwright, Chromium only, against a production build (`next build` + `next start` via Playwright's `webServer`; `E2E_SKIP_BUILD=1` reuses an existing build). Projects `desktop` 1440×900 and `phone` 390×844 (touch, 3×). Checks: `/` returns 200 with no console or page errors; one `main` landmark and one `h1`; `X-Robots-Tag: noindex, nofollow` while not launched (absent once launched); an unknown route returns 404. Tests live in `e2e/`. First run on a machine: `npx --no-install playwright install chromium`. | Terminal; on failure `test-results/` (traces); in CI also `playwright-report/` |
| `npm run review:shots -- <ID> [targets…] [--headed]` | Builds, then captures each target on desktop 1440×900 (1×) and phone 390×844 (3×). A target is a route (`/`, the default) or a name in `scripts/review/targets.mjs` (PF-008 adds chapter stops there). | `.review/<ID>/<target>-desktop.png`, `<target>-phone.png`, `capture.json` (viewport, URL, timestamp, WebGL vendor/renderer and whether it is a real GPU) |
| `npm run size` | After `npm run build`: for each page route in the build (plus the 404 page), fetches the served HTML, collects every JS file it loads (`<script src>`, `<link rel=preload/modulepreload as=script>`), measures gzip (zlib default level, as `next start` serves it) and Brotli (q11). Gate: first-load JS ≤ 200 KB **gzip** (the stricter of the two). `nomodule` polyfills are printed but not counted (modern browsers never load them). Exit 1 over a limit. | Terminal table |
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
docs/                      README (index), architecture, assets, licences
e2e/                       Playwright browser smoke tests
scripts/                   size-report, review-shots, lighthouse; lib/prod-server (free-port next start)
scripts/review/targets.mjs named capture targets and viewports for review:shots
src/app/                   App Router: layout.tsx, page.tsx, robots.ts, globals.css (Tailwind + tokens); *.test.tsx beside the code
src/config/site.ts         launch switch (SITE_LAUNCHED)
budgets.config.mjs         budget limits used by the size report and Lighthouse (STANDARDS §3)
playwright.config.ts       Playwright: desktop + phone projects, production webServer
vitest.config.mts          Vitest: jsdom, React plugin, @/* alias; vitest.setup.ts adds jest-dom
.env.example               env var names only, never values
.nvmrc                     Node major version for CI and local use
CLAUDE.md                  this file
CONTENT-LICENSE.md         content, media, models, resume: all rights reserved
LICENSE                    MIT, source code only
next.config.ts             Next.js config, X-Robots-Tag header
```

Docs to update in the same PR as the change: this file, the affected `docs/` files, every new asset in `docs/assets.md`, every third-party thing in `docs/licences.md`.
