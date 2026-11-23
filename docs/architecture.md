# Architecture

Outline only. Each section is filled in by the item that builds it.

## 1. Architecture

### DOM first
Every page is server-rendered HTML inside one shell (`src/components/layout/site-shell.tsx`, used by the root layout): skip link → sticky header (name + persistent navigation + "Simple view" switch) → the one `main` landmark (`id="main"`) → footer (email, GitHub, LinkedIn, copyright). Text and controls live only in the DOM, styled with the design tokens in `src/app/globals.css`; the canvas (PF-007) will sit behind this layer. The only client components so far are the navigation (mobile menu) and the switch. Without JavaScript the navigation is shown as a plain list (`noscript:` = `@media (scripting: none)`) and the switch is hidden. Site text comes from `src/content/site.ts` (BRIEF §8; PF-006 folds it into the content model).

### One persistent canvas
_To be filled in._

### Native scroll
_To be filled in._

### One source of truth for progress
_To be filled in._

### Chapters are modules
_To be filled in._

### Content is typed data
_To be filled in._

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
