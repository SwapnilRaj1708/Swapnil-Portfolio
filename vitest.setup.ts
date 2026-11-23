// Adds the jest-dom matchers (toBeInTheDocument, toHaveTextContent, …) to Vitest's expect,
// and unmounts rendered components after each test.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

// next/font/google only works inside Next's compiler. In unit tests each font becomes a stub
// with the same shape (className, variable, style). Add a name here when src/fonts uses a new font.
vi.mock("next/font/google", () => {
  const stub = (family: string) => (options?: { variable?: string }) => ({
    className: `font-stub-${family}`,
    variable: options?.variable ? `font-stub-var-${family}` : "",
    style: { fontFamily: family },
  });
  return {
    Space_Grotesk: stub("Space Grotesk"),
    Inter: stub("Inter"),
    JetBrains_Mono: stub("JetBrains Mono"),
    Geist: stub("Geist"),
    Geist_Mono: stub("Geist Mono"),
    Archivo: stub("Archivo"),
    IBM_Plex_Sans: stub("IBM Plex Sans"),
    IBM_Plex_Mono: stub("IBM Plex Mono"),
  };
});

// next/font/local (Satoshi, pairing D) – same stub shape. Its file is downloaded at build time
// (scripts/fetch-fonts.mjs), so unit tests must never need it.
vi.mock("next/font/local", () => ({
  default: (options?: { variable?: string }) => ({
    className: "font-stub-local",
    variable: options?.variable ? "font-stub-var-local" : "",
    style: { fontFamily: "local" },
  }),
}));
