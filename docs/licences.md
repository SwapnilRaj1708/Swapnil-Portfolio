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
