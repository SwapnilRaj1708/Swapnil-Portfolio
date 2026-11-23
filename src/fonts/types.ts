export type FontPairingId = "A" | "B" | "C" | "D";

export type FontPairing = {
  id: FontPairingId;
  /** Human-readable name, e.g. "Space Grotesk + Inter + JetBrains Mono". */
  name: string;
  heading: string;
  body: string;
  mono: string;
  /**
   * Classes that define --ff-heading, --ff-body and --ff-mono (next/font `variable` classes).
   * Put on <html> for the site, or on a wrapper to preview a pairing.
   */
  className: string;
};
