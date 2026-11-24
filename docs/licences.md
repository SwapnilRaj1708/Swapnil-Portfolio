# Third-party licences

Every third-party package, font, texture or other asset, added in the same PR that brings it in. Licences as stated in the installed package's `package.json`.

| Name | Source | Licence | Date | Where used |
|---|---|---|---|---|
| Next.js (`next`) | npm | MIT | 2026-11-21 | Framework: routing, rendering, build |
| React (`react`, `react-dom`) | npm | MIT | 2026-11-21 | UI library |
| Tailwind CSS (`tailwindcss`, `@tailwindcss/turbopack`) | npm | MIT | 2026-11-21 | Styling (build time) |
| TypeScript (`typescript`) | npm | Apache-2.0 | 2026-11-21 | Type checking (build time) |
| Vitest (`vitest`) | npm | MIT | 2026-11-21 | Unit test runner (dev only) |
| `@vitejs/plugin-react` | npm | MIT | 2026-11-21 | JSX/React transform for Vitest (dev only) |
| jsdom (`jsdom`) | npm | MIT | 2026-11-21 | Browser-like DOM for unit tests (dev only) |
| Testing Library (`@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`; `@testing-library/dom` comes in as their peer) | npm | MIT | 2026-11-21 | Component tests and DOM matchers (dev only) |
| Playwright (`@playwright/test`, with its Chromium download) | npm | Apache-2.0 | 2026-11-21 | Browser smoke tests, review screenshots, Chrome for Lighthouse (dev only) |
| Lighthouse CI (`@lhci/cli`, bundles `lighthouse`) | npm | Apache-2.0 | 2026-11-21 | Local Lighthouse runs (dev only) |
| clsx (`clsx`) | npm | MIT | 2026-11-23 | Class-name merging in components (runtime) |
| axe-core for Playwright (`@axe-core/playwright` 4.14.0, with its dependency `axe-core` 4.14.1, already in the tree through `eslint-plugin-jsx-a11y`) | npm | MPL-2.0 (used unmodified as a dev tool; nothing of it ships to the site) | 2026-11-23 | Accessibility checks in the contact-flow browser tests (`e2e/axe.ts`, PF-019) (dev only) |
| Space Grotesk | Google Fonts, via `next/font/google` (files downloaded at build time and served by the site; the browser never contacts Google) | SIL OFL 1.1 | 2026-11-23 | Pairing A: headings – `/dev/type` preview only (pairing D is active, D-31) |
| Inter | Google Fonts, via `next/font/google` (self-hosted as above) | SIL OFL 1.1 | 2026-11-23 | Pairing D (active, D-31): body text – `src/fonts/pairing-d.ts`; also pairing A on `/dev/type` |
| Inter Medium, TrueType (`Inter-Medium.ttf`, Google Fonts static file v20) | `https://fonts.gstatic.com/s/inter/v20/…ttf`, downloaded at build time by `scripts/fetch-fonts.mjs` into git-ignored `src/fonts/vendor/inter/`, pinned by SHA-256 | SIL OFL 1.1 | 2026-11-24 | Social images (PF-028, `src/lib/social-image.tsx`): next/og reads TTF but not the WOFF2 that next/font uses. Read at build time only and drawn into the PNGs; browsers never load the file |
| sharp (`sharp` 0.35.5, with `@img/sharp-*` prebuilt libvips) | npm, already installed as a dependency of `next` (its image optimiser); not added by this repo | Apache-2.0 (sharp); LGPL-3.0-or-later (the bundled libvips binary) | 2026-11-24 | Build and test tooling only (PF-028): `scripts/encode-stills.mjs` encodes the Blender stills and icons; `src/styles/still-contrast.test.ts` decodes them. next/image uses it on the server; nothing of it reaches the browser |
| JetBrains Mono | Google Fonts, via `next/font/google` (self-hosted as above) | SIL OFL 1.1 | 2026-11-23 | Pairing D (active, D-31): labels and readouts – `src/fonts/pairing-d.ts`; also pairing A on `/dev/type` |
| Geist | Google Fonts, via `next/font/google` (self-hosted as above) | SIL OFL 1.1 | 2026-11-23 | Pairing B: headings and body – `/dev/type` preview only |
| Geist Mono | Google Fonts, via `next/font/google` (self-hosted as above) | SIL OFL 1.1 | 2026-11-23 | Pairing B: labels – `/dev/type` preview only |
| Archivo | Google Fonts, via `next/font/google` (self-hosted as above) | SIL OFL 1.1 | 2026-11-23 | Pairing C: headings – `/dev/type` preview only |
| IBM Plex Sans | Google Fonts, via `next/font/google` (self-hosted as above) | SIL OFL 1.1 | 2026-11-23 | Pairing C: body – `/dev/type` preview only |
| IBM Plex Mono | Google Fonts, via `next/font/google` (self-hosted as above) | SIL OFL 1.1 | 2026-11-23 | Pairing C: labels – `/dev/type` preview only |
| Satoshi (Deni Anggara / Indian Type Foundry) | Fontshare, official package `https://api.fontshare.com/v2/fonts/download/satoshi` (from https://www.fontshare.com/fonts/satoshi); only `Satoshi-Variable.woff2` (wght 300–900) is used, unmodified | ITF Free Font License (FFL) 2.0, 17 Aug 2026 – free for personal and commercial use; self-hosting on our own website allowed (§01); redistribution, including through a repository or publicly accessible server, not allowed (§02); no modification, subsetting or format conversion (§02, §05) | 2026-11-23 | Pairing D (active, D-31): headings on every page – `src/fonts/pairing-d.ts`. **Not committed** (the repo is public, §02): `scripts/fetch-fonts.mjs` downloads the package at build time into git-ignored `src/fonts/vendor/satoshi/` with the licence text (`FFL.txt`) beside it; `next/font/local` serves the file from this site; the build fails if the download fails or the file's SHA-256 differs from the value pinned in the script (a new release is accepted only on purpose) |
| zod (`zod`) | npm | MIT | 2026-11-23 | Content schemas: build-time validation of `src/content/`; server-side check of contact submissions (`src/lib/contact/submission.ts`). Server only, not in the browser bundle |
| Resend Node.js SDK (`resend` 6.39.0, with its dependencies `postal-mime` 2.7.6 and `standardwebhooks` 1.1.1) | npm | MIT (`resend`, `standardwebhooks`); MIT-0 (`postal-mime`) | 2026-11-23 | Contact flow delivery (PF-019, D-18, D-33): `src/lib/contact/resend-mailer.ts`, server only (POST `/api/contact`). The Resend service itself is the owner's account |
| Stand-in project screenshots (Twizzr, PG Gurukul, CREO, EngineerHUB website, Windows 10 Clone) | Captured by `npm run media:capture` from each project's public live homepage, 2026-11-23 | Third-party and client sites shown with the owner's clearance (BRIEF §8, 2026-11-21: every project "cleared: yes"; stand-in screenshots of the live sites allowed until the owner's media arrives). Marked `provisional: true` in the content | 2026-11-23 | `public/media/projects/<slug>/home.webp` – project cards and case studies; to be replaced by the owner's media (docs/content.md) |
