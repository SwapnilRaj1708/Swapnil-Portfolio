/**
 * Fonts module. Four pairings live beside this file (pairing-a/b/c/d.ts); the site loads exactly
 * ONE of them. To switch, change the import below – nothing else. A, B and C are SIL OFL fonts
 * via next/font/google; D uses Satoshi via next/font/local, downloaded at build time by
 * scripts/fetch-fonts.mjs (its licence forbids committing the file to this public repository).
 *
 * Active: pairing D – Satoshi headings, Inter body, JetBrains Mono labels (owner decision D-31).
 * A, B and C are shown on /dev/type only.
 *
 * Each pairing is its own file on purpose: next/font emits @font-face rules and preload links
 * for every font call in a module the page imports, so importing all three here would make
 * every page download all of them. /dev/type imports the four files directly to compare them.
 */
export { pairingD as activePairing } from "./pairing-d";

export type { FontPairing, FontPairingId } from "./types";
