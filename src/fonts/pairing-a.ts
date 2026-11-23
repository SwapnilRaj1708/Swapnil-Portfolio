import { clsx } from "clsx";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import type { FontPairing } from "./types";

// next/font downloads the files at build time and serves them from the site itself; the browser
// never contacts Google. Fallback metrics (size-adjust etc.) are generated, so there is no
// layout shift when the web font arrives.

const heading = Space_Grotesk({ subsets: ["latin"], display: "swap", variable: "--ff-heading" });
const body = Inter({ subsets: ["latin"], display: "swap", variable: "--ff-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--ff-mono" });

export const pairingA: FontPairing = {
  id: "A",
  name: "Space Grotesk + Inter + JetBrains Mono",
  heading: "Space Grotesk",
  body: "Inter",
  mono: "JetBrains Mono",
  className: clsx(heading.variable, body.variable, mono.variable),
};
