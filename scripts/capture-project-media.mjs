// Stand-in project media: npm run media:capture -- [slug…] [--headed]
//
// Until the owner's own media arrives (PF-006 note), each project gets a screenshot of its live
// site's homepage: Playwright's full Chromium, desktop 1440×900 at 1×, first screen only (no
// scrolling, no logging in, no typing; the only click allowed is a cookie notice's close button –
// never "accept"). The PNG is re-encoded to WebP by the browser's own encoder at the highest
// quality that keeps the file ≤ 250 KB, and written to public/media/projects/<slug>/home.webp.
//
// A site is SKIPPED (nothing written) when it does not load, answers with an HTTP error, shows a
// login form, redirects to a sign-in page, or is blank. Projects whose media is not provisional
// (the owner's own files) are never touched.
//
// The project list (slug, live URL, media) is read from src/content/data/projects.ts – Node runs
// the TypeScript file directly (type stripping). After a run, add or update each project's media
// entry with the printed snippet; see docs/content.md.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { projects } from "../src/content/data/projects.ts";
import { ROOT } from "./lib/prod-server.mjs";

const VIEWPORT = { width: 1440, height: 900 };
const MAX_BYTES = 250 * 1000;
const QUALITIES = [0.86, 0.8, 0.74, 0.68, 0.6, 0.5, 0.4];
const SETTLE_MS = 2500; // intro animations
const SOURCE = `live-site screenshot, ${new Date().toISOString().slice(0, 10)}`;

/** Closes a cookie notice by its close button, if one is shown. Never accepts anything. */
async function dismissCookieNotice(page) {
  const notice = page
    .locator("[role=dialog], [role=alertdialog], [role=region], aside, section, div")
    .filter({ hasText: /cookie/i })
    .last();
  if (!(await notice.isVisible().catch(() => false))) return false;
  const close = notice.getByRole("button", { name: /^(close|dismiss|×|✕|x)$/i }).first();
  if (await close.isVisible().catch(() => false)) {
    await close.click({ timeout: 3000 }).catch(() => {});
    return true;
  }
  return false;
}

/** Reasons not to capture: login form, sign-in redirect, blank page. */
async function whyUnusable(page, liveUrl) {
  const finalUrl = new URL(page.url());
  if (/(^|\/)(login|log-in|signin|sign-in|auth|account)(\/|$)/i.test(finalUrl.pathname)) {
    return `redirected to a sign-in page (${finalUrl.href})`;
  }
  if (await page.locator("input[type=password]").first().isVisible().catch(() => false)) {
    return "shows a login form";
  }
  const textLength = await page.evaluate(() => (document.body?.innerText ?? "").trim().length);
  if (textLength < 40) return `blank or nearly blank page (${textLength} characters of text)`;
  // A sign-in screen without a password field (e.g. only "Continue with Google"): a short page
  // whose main action is signing in.
  const signIn = page.getByRole("button", { name: /continue with|sign in with|log in with|^sign in$|^log in$/i });
  if (textLength < 400 && (await signIn.first().isVisible().catch(() => false))) {
    return "shows only a sign-in screen";
  }
  if (finalUrl.hostname.replace(/^www\./, "") !== new URL(liveUrl).hostname.replace(/^www\./, "")) {
    return `redirected to another site (${finalUrl.hostname})`;
  }
  return null;
}

/** Re-encodes a PNG to WebP inside the browser (canvas encoder), as large a quality as fits. */
async function toWebp(encoderPage, png) {
  for (const quality of QUALITIES) {
    const base64 = await encoderPage.evaluate(
      async ({ data, q }) => {
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        const blob = await canvas.convertToBlob({ type: "image/webp", quality: q });
        if (blob.type !== "image/webp") throw new Error(`encoder produced ${blob.type}, not WebP`);
        const buf = new Uint8Array(await blob.arrayBuffer());
        let s = "";
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(s);
      },
      { data: png.toString("base64"), q: quality },
    );
    const webp = Buffer.from(base64, "base64");
    if (webp.length <= MAX_BYTES) return { webp, quality };
  }
  throw new Error(`could not get the WebP under ${MAX_BYTES / 1000} KB`);
}

async function main() {
  const args = process.argv.slice(2);
  const headed = args.includes("--headed");
  const slugs = args.filter((a) => !a.startsWith("--"));
  for (const s of slugs) if (!projects.some((p) => p.slug === s)) throw new Error(`Unknown project slug "${s}"`);
  const list = projects.filter((p) => slugs.length === 0 || slugs.includes(p.slug));

  const browser = await chromium.launch({ channel: "chromium", headless: !headed });
  const encoderContext = await browser.newContext();
  const encoderPage = await encoderContext.newPage();
  const captured = [];
  const skipped = [];
  try {
    for (const project of list) {
      const url = project.links.live;
      if (project.media.some((m) => !m.provisional)) {
        skipped.push({ slug: project.slug, url, reason: "has the owner's own media – not replaced" });
        continue;
      }
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: "en-US" });
      const page = await context.newPage();
      try {
        const response = await page.goto(url, { waitUntil: "load", timeout: 45_000 });
        if (!response) throw new Error("no response");
        if (response.status() >= 400) throw new Error(`HTTP ${response.status()}`);
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(SETTLE_MS);
        const dismissed = await dismissCookieNotice(page);
        if (dismissed) await page.waitForTimeout(800);
        const reason = await whyUnusable(page, url);
        if (reason) {
          skipped.push({ slug: project.slug, url, reason });
          continue;
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        const png = await page.screenshot({ type: "png" });
        const { webp, quality } = await toWebp(encoderPage, png);
        const dir = path.join(ROOT, "public", "media", "projects", project.slug);
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, "home.webp"), webp);
        captured.push({ slug: project.slug, url, finalUrl: page.url(), bytes: webp.length, quality, dismissed });
      } catch (err) {
        skipped.push({ slug: project.slug, url, reason: `failed to load: ${err instanceof Error ? err.message.split("\n")[0] : err}` });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\nCaptured (${VIEWPORT.width}×${VIEWPORT.height}, WebP ≤ ${MAX_BYTES / 1000} KB):`);
  for (const c of captured) {
    console.log(
      `  ${c.slug.padEnd(18)} ${(c.bytes / 1000).toFixed(1).padStart(6)} KB  q=${c.quality}  ${c.finalUrl}` +
        (c.dismissed ? "  (cookie notice closed)" : ""),
    );
  }
  console.log("\nSkipped:");
  if (skipped.length === 0) console.log("  none");
  for (const s of skipped) console.log(`  ${s.slug.padEnd(18)} ${s.url} – ${s.reason}`);
  console.log("\nMedia entry for each captured project (src/content/data/projects.ts):");
  for (const c of captured) {
    const name = projects.find((p) => p.slug === c.slug).name;
    console.log(
      `  ${c.slug}: { src: "/media/projects/${c.slug}/home.webp", alt: "Homepage of ${name}", ` +
        `width: ${VIEWPORT.width}, height: ${VIEWPORT.height}, provisional: true, source: "${SOURCE}" }`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
