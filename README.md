# Swapnil Raj – portfolio

The source of [swapnilraj.in](https://swapnilraj.in), the portfolio of Swapnil Raj, a full-stack engineer.

## What the site is

- **Home (`/`)** – one page in six chapters: hero, about, experience, selected work, skills, and services and contact. Each chapter opens on a still from a dark "inside the machine" world.
- **Work (`/work`)** – every project, featured first, with the role and the stack; a case study per project (`/work/<project>`): problem, role, approach, outcome, stack and links.
- **Resume (`/resume`)** – the resume as a page, with a PDF download.
- **Contact** – a short flow that asks one question at a time (mostly by picking options) and sends the message by email. Without JavaScript it is one plain form; a direct email link is always there too.

Every page is server-rendered HTML that reads fully with JavaScript off, works by keyboard and screen reader, and stays light (first-load JavaScript under 200 KB per page). A scroll-driven 3D journey through the same content is being built; these pages stay as the fast, plain way through.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router, Turbopack) and React 19, TypeScript in strict mode
- Tailwind CSS 4, with the design tokens in `src/app/globals.css`
- Content as typed data in `src/content/`, validated with zod when the site builds
- Contact delivery through [Resend](https://resend.com)
- Hosted on Vercel, with Vercel Web Analytics and Speed Insights (cookieless) on the live site
- Tests: Vitest and Testing Library (unit and component), Playwright with axe-core (browser and accessibility), Lighthouse CI (local)

## Run it

Requires the Node.js version in [`.nvmrc`](.nvmrc) and network access on the first build: the heading font (Satoshi) is downloaded at build time from Fontshare, because its licence does not allow it in a public repository.

```bash
npm ci              # install dependencies from the lockfile
npm run dev         # development server on http://localhost:3000
npm run typecheck   # TypeScript check
npm run lint        # lint
npm test            # unit and component tests
npm run test:e2e    # browser tests against a production build (first run: npx --no-install playwright install chromium)
npm run build       # production build
npm run start       # serve the production build
```

Sending contact messages needs a Resend API key in `.env.local`; the variable names are in [`.env.example`](.env.example). Without a key the site works and the contact form reports that the message could not be sent.

Local builds and preview deployments are never indexed by search engines; only the production deployment is (`src/config/site.ts`).

## Licence

The source code is under the MIT licence – see [`LICENSE`](LICENSE). All content (text, images, photographs, 3D models, renders, video and the resume) is © Swapnil Raj, all rights reserved, and is not covered by the MIT licence – see [`CONTENT-LICENSE.md`](CONTENT-LICENSE.md). Third-party packages, fonts and services keep their own licences – see [`docs/licences.md`](docs/licences.md).
