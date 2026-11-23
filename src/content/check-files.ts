import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Content } from "./schema";

/**
 * Build-time file check (Node only – next.config.ts calls it during `next build` and `next dev`;
 * the content tests call it too). Every media file and the resume PDF the content names must
 * exist under public/, and a WebP image's real pixel size must match the width and height in
 * the data (they reserve the image's space, so a mismatch would distort it).
 * Returns a list of problems; empty means all good.
 */
export function checkContentFiles(content: Content, publicDir: string): string[] {
  const problems: string[] = [];

  for (const project of content.projects) {
    project.media.forEach((media, i) => {
      const where = `projects "${project.slug}" media[${i}] (${media.src})`;
      const file = path.join(publicDir, media.src);
      if (!existsSync(file)) {
        problems.push(`${where}: file not found in public/`);
        return;
      }
      const size = media.src.endsWith(".webp") ? webpSize(readFileSync(file)) : null;
      if (size && (size.width !== media.width || size.height !== media.height)) {
        problems.push(
          `${where}: the file is ${size.width}×${size.height} px but the data says ${media.width}×${media.height}`,
        );
      }
    });
  }

  const pdf = path.join(publicDir, content.site.resumePdf.href);
  if (!existsSync(pdf)) problems.push(`site.resumePdf (${content.site.resumePdf.href}): file not found in public/`);

  return problems;
}

/** Pixel size from a WebP file header (lossy VP8, lossless VP8L or extended VP8X). */
export function webpSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  if (chunk === "VP8 ") {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}
