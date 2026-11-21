import type { Metadata } from "next";
import { SITE_LAUNCHED } from "@/config/site";
import "./globals.css";

export const metadata: Metadata = {
  title: "Swapnil Raj",
  description: "I build fast, real-time web products that people actually use.",
  // Launch switch (src/config/site.ts). Child segments must not set `robots`:
  // metadata merges shallowly, so a child value would replace this one.
  robots: SITE_LAUNCHED ? undefined : { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
