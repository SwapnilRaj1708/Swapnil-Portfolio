# Assets

Every asset the site ships, written by the asset pipeline. Sizes are compressed transfer sizes.

| Slug | Source file | Date | Triangles | Textures | Size high | Size low | Licence |
|---|---|---|---|---|---|---|---|

## Stage 1 stills and icons (PF-028)

Blender renders approved by the owner (`Blender Assets/stills/`, REPORT-stills.md runs 1 and 2), encoded by `npm run media:stills` (`scripts/encode-stills.mjs`, sharp from the Next.js install). The script only reads the assets folder. It writes the files below and fails without writing anything if a source has the wrong size, or if a still served by next/image at its largest size would exceed 250 KB.

- **Stills** are WebP masters at full resolution (lossy, quality 90, effort 6, smart subsampling; mean difference to the PNG 0.7–1.2 / 255). The site never serves a master as it is: next/image resizes each one per device and re-encodes it (AVIF, else WebP, quality 75). The stills are drawn full-bleed, so the largest variant is the master's own width, because next/image never enlarges. "Largest served" is that variant, measured from the running build by `npm run size`.
- **Social background**: `still-social.png` downscaled to 1200 × 630 JPEG (quality 90, mozjpeg). next/og reads PNG or JPEG, not WebP.
- **Icons** are made from `icon-mark-transparent.png` (favicon, trimmed to the mark so it fills 16 px) and `icon-mark.png` (the mark on #07090C: app icons and the apple-touch icon), using Lanczos downscaling.

Date of all files: 2026-11-24.

| Slug | Source file | Dimensions | Bytes in repo | Largest served (AVIF / WebP) | Where used | Licence |
|---|---|---|---|---|---|---|
| `still-s1-port-wide` | `stills/still-s1-port-wide.png` | 2560 × 1440 | 57 368 | 19.7 KB / 27.9 KB | hero, landscape screens | © Swapnil Raj |
| `still-s1-port-portrait` | `stills/still-s1-port-portrait.png` | 1080 × 1920 | 32 232 | 11.4 KB / 15.7 KB | hero, portrait screens | © Swapnil Raj |
| `still-s1-bus-wide` | `stills/still-s1-bus-wide.png` | 2560 × 1080 | 156 106 | 34.6 KB / 51.7 KB | About banner from `md` | © Swapnil Raj |
| `still-s1-bus-portrait` | `stills/still-s1-bus-portrait.png` | 1080 × 1350 | 65 290 | 17.1 KB / 23.1 KB | About banner below `md` | © Swapnil Raj |
| `still-s1-memory-wide` | `stills/still-s1-memory-wide.png` | 2560 × 1080 | 50 182 | 20.0 KB / 26.1 KB | Experience banner from `md` | © Swapnil Raj |
| `still-s1-memory-portrait` | `stills/still-s1-memory-portrait.png` | 1080 × 1350 | 41 988 | 15.0 KB / 22.0 KB | Experience banner below `md` | © Swapnil Raj |
| `still-s1-array-wide` | `stills/still-s1-array-wide.png` | 2560 × 1080 | 48 834 | 13.9 KB / 15.2 KB | Projects banner from `md` | © Swapnil Raj |
| `still-s1-array-portrait` | `stills/still-s1-array-portrait.png` | 1080 × 1350 | 15 352 | 6.2 KB / 7.7 KB | Projects banner below `md` | © Swapnil Raj |
| `still-s1-core-wide` | `stills/still-s1-core-wide.png` (run 2) | 2560 × 1080 | 78 232 | 27.3 KB / 37.4 KB | Skills banner from `md` | © Swapnil Raj |
| `still-s1-core-portrait` | `stills/still-s1-core-portrait.png` (run 2) | 1080 × 1350 | 65 934 | 21.3 KB / 31.8 KB | Skills banner below `md` | © Swapnil Raj |
| `still-s1-uplink-wide` | `stills/still-s1-uplink-wide.png` | 2560 × 1080 | 11 630 | 3.2 KB / 7.3 KB | Contact banner from `md` | © Swapnil Raj |
| `still-s1-uplink-portrait` | `stills/still-s1-uplink-portrait.png` | 1080 × 1350 | 10 460 | 3.5 KB / 5.7 KB | Contact banner below `md` | © Swapnil Raj |
| `still-social` | `stills/still-social.png` (2400 × 1260) | 1200 × 630 JPEG | 29 496 | – (drawn into the social images: about 240 KB PNG each) | background of `/opengraph-image`, `/work/opengraph-image`, `/resume/opengraph-image` | © Swapnil Raj |
| `favicon` (`src/app/favicon.ico`) | `stills/icon-mark-transparent.png` | 16, 32, 48 (PNG in ICO) | 2 699 | as is | browser tab | © Swapnil Raj |
| `icon-192` (`src/app/icon1.png`) | `stills/icon-mark.png` | 192 × 192 | 3 516 | as is | app icon, manifest | © Swapnil Raj |
| `icon-512` (`src/app/icon2.png`) | `stills/icon-mark.png` | 512 × 512 | 11 371 | as is | app icon, manifest | © Swapnil Raj |
| `apple-icon` (`src/app/apple-icon.png`) | `stills/icon-mark.png` | 180 × 180 | 3 140 | as is | apple-touch icon | © Swapnil Raj |

Stills files live in `public/media/stills/`. Their sizes and paths are in the content data (`src/content/data/stills.ts`), and `next build` checks them against the files. To replace a still: render it in Blender, run `npm run media:stills`, then `npm test`. The contrast test samples the new file. Then `npm run size`.

Not used: `icon-mark-64.png` (the favicon is made from the 1024 px transparent mark).

## Project images (stand-ins, PF-006)

Screenshots of each project's public live homepage, captured by `npm run media:capture` (`scripts/capture-project-media.mjs`: full Chromium, 1440 × 900, first screen, no login) on 2026-11-23. Marked `provisional: true` in `src/content/data/projects.ts` until the owner's media arrives (`docs/content.md`). Softboard Lite, LetsChat and Recall have no public preview (behind sign-in) and show a readout tile instead. Served by next/image (AVIF, else WebP, quality 75) at the sizes in `src/components/projects/image-sizes.ts`.

| Slug | File | Dimensions | Bytes in repo | Alt text | Where used | Rights |
|---|---|---|---|---|---|---|
| `twizzr` | `public/media/projects/twizzr/home.webp` | 1440 × 900 | 77 164 | Homepage of Twizzr | `/`, `/work`, `/work/twizzr` | EL Nova Labs' site; shown with the owner's clearance (BRIEF §8) |
| `pg-gurukul` | `public/media/projects/pg-gurukul/home.webp` | 1440 × 900 | 60 548 | Homepage of PG Gurukul | `/`, `/work`, `/work/pg-gurukul` | Client site (via EL Nova Labs); shown with the owner's clearance |
| `creo` | `public/media/projects/creo/home.webp` | 1440 × 900 | 74 574 | Homepage of CREO | `/`, `/work`, `/work/creo` | Client site (freelance); shown with the owner's clearance |
| `engineerhub` | `public/media/projects/engineerhub/home.webp` | 1440 × 900 | 45 556 | Homepage of the EngineerHUB website | `/`, `/work`, `/work/engineerhub` | EngineerHUB's site; shown with the owner's clearance |
| `windows-10-clone` | `public/media/projects/windows-10-clone/home.webp` | 1440 × 900 | 26 094 | Homepage of Windows 10 Clone | `/work`, `/work/windows-10-clone` | The owner's personal project |
