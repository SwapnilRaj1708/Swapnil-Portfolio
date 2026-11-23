import { clsx } from "clsx";
import { Inter, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import type { FontPairing } from "./types";

// Pairing A with the heading face replaced by Satoshi.
//
// Satoshi (Indian Type Foundry, ITF Free Font License) may be self-hosted but not redistributed,
// so its file is not in this repository: scripts/fetch-fonts.mjs downloads the official Fontshare
// package before every build and dev run into src/fonts/vendor/ (git-ignored). next/font/local
// copies the file into the build and serves it from this site. adjustFontFallback (default
// "Arial") generates size-adjusted fallback metrics, so there is no layout shift.
//
// Inter and JetBrains Mono use the same options as pairing-a.ts, so both pairings share the same
// self-hosted files.

// next/font/local names the @font-face family after this constant ("satoshi").
const satoshi = localFont({
  src: "./vendor/satoshi/Satoshi-Variable.woff2",
  weight: "300 900",
  style: "normal",
  display: "swap",
  variable: "--ff-heading",
});
const body = Inter({ subsets: ["latin"], display: "swap", variable: "--ff-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--ff-mono" });

export const pairingD: FontPairing = {
  id: "D",
  name: "Satoshi + Inter + JetBrains Mono",
  heading: "Satoshi",
  body: "Inter",
  mono: "JetBrains Mono",
  className: clsx(satoshi.variable, body.variable, mono.variable),
};
