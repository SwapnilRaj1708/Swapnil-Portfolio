import { clsx } from "clsx";
import { Geist, Geist_Mono } from "next/font/google";
import type { FontPairing } from "./types";

// See pairing-a.ts for how next/font self-hosts the files.

const sans = Geist({ subsets: ["latin"], display: "swap", variable: "--ff-body" });
const mono = Geist_Mono({ subsets: ["latin"], display: "swap", variable: "--ff-mono" });

export const pairingB: FontPairing = {
  id: "B",
  name: "Geist + Geist Mono",
  heading: "Geist",
  body: "Geist",
  mono: "Geist Mono",
  // Headings use the same family as the body.
  className: clsx(sans.variable, mono.variable, "[--ff-heading:var(--ff-body)]"),
};
