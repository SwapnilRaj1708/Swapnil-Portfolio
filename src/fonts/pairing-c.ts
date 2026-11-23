import { clsx } from "clsx";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import type { FontPairing } from "./types";

// See pairing-a.ts for how next/font self-hosts the files.

const heading = Archivo({ subsets: ["latin"], display: "swap", variable: "--ff-heading" });
const body = IBM_Plex_Sans({ subsets: ["latin"], display: "swap", variable: "--ff-body" });
// IBM Plex Mono has no variable version: load the two weights the labels use.
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--ff-mono",
});

export const pairingC: FontPairing = {
  id: "C",
  name: "Archivo + IBM Plex Sans + IBM Plex Mono",
  heading: "Archivo",
  body: "IBM Plex Sans",
  mono: "IBM Plex Mono",
  className: clsx(heading.variable, body.variable, mono.variable),
};
