// `sizes` for project images: how wide each one is drawn, so the browser picks the smallest file
// that is still sharp (next/image builds the srcset from `deviceSizes` and `imageSizes`).
// Measured in Chromium at 360–1920 px wide; a value may run a few pixels over, never under.
//
// What sits between the viewport edge and the screenshot:
//   page gutter (`--spacing-gutter`, 1rem … 2.5rem) + card border and padding (13 px, 17 px from
//   `sm`) + display-frame border, padding and inner border (8 px) – on each side.

/**
 * A card in the project grid (/work and the home page's #work): one column on phones, two from
 * `md` (48rem), the content column capped at 80rem. The home page's lead card puts its screen
 * beside the text from `md`, which is the same width.
 * Measured: 284 px at 360, 334 px at 412, 301 px at 768, 424 px at 1024, 544 px at 1440 and up.
 */
export const CARD_IMAGE_SIZES = "(min-width: 80rem) 34rem, (min-width: 48rem) calc(50vw - 5rem), calc(100vw - 4.5rem)";

/**
 * The first screen on a case study: the full content column.
 * Measured: 310 px at 360, 360 px at 412, 702 px at 768, 948 px at 1024, 1187 px at 1440 and up.
 */
export const CASE_STUDY_IMAGE_SIZES = "(min-width: 80rem) 75rem, calc(100vw - 3rem)";

/**
 * Further screens on a case study ("Media" block): inside the prose column (`max-w-prose`, 40rem).
 * No project has a second image yet, so this one is derived from the layout, not measured.
 */
export const CASE_STUDY_MORE_IMAGE_SIZES = "(min-width: 44rem) 40rem, calc(100vw - 3rem)";
