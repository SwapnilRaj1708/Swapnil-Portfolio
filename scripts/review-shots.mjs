// Review screenshots: npm run review:shots -- <ID> [routes or named targets…] [--headed] [--full-page]
//
// Builds the site (the npm script runs `npm run build` first: font download, then `next build`),
// serves it with `next start` on a free port, and captures every target on a desktop (1440×900) and a phone (390×844) viewport
// into .review/<ID>/ as <target>-desktop.png and <target>-phone.png. It also writes
// .review/<ID>/capture.json with the viewport, URL, timestamp and the WebGL renderer the page
// reports, so a review can tell a software renderer (SwiftShader) from a real GPU.
//
// GPU (D-40): every page is opened with `?gpu=low-power` (honoured off the production deployment
// only), so the canvas asks for the integrated GPU – on the reference laptop the AMD Radeon the
// numbers are measured on – instead of the visitors' "high-performance". capture.json records the
// renderer a context with that preference gets.
//
// --headed     runs a visible browser window, which normally gets the real GPU.
// --full-page  captures the whole scrollable page instead of the first screen (it scrolls through
//              the page first, so lazy-loaded images are in the picture).
//
// A named target with `download` (scripts/review/targets.mjs: social images, icons) saves the
// served file itself instead of a screenshot. capture.json keeps the captures of earlier runs into
// the same folder (a run with ENABLE_DEV_PAGES=1 for /dev pages adds to it).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { resolveTargets, VIEWPORTS } from "./review/targets.mjs";
import { ROOT, startProdServer } from "./lib/prod-server.mjs";

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render/i;

/** The GPU the captures ask for (the canvas's `?gpu=` override, and the renderer readout below). */
const CAPTURE_GPU = "low-power";

/** Reads the WebGL renderer a context with this powerPreference gets (runs inside the browser). */
function readWebGlInfo(powerPreference) {
  const canvas = document.createElement("canvas");
  const gl2 = canvas.getContext("webgl2", { powerPreference });
  const gl = gl2 ?? canvas.getContext("webgl", { powerPreference });
  if (!gl) return { available: false, webgl2: false, vendor: null, renderer: null, version: null };
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const info = {
    available: true,
    webgl2: !!gl2,
    vendor: String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
    renderer: String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
    version: String(gl.getParameter(gl.VERSION)),
  };
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return info;
}

// Chromium cannot capture an image taller than about 16 384 device pixels; past that the
// picture repeats. Full-page captures taller than this are split into numbered parts.
const MAX_CAPTURE_DEVICE_PX = 16000;

/**
 * Takes the screenshot(s) for one target and viewport; returns the file names written.
 * @param {import("@playwright/test").Page} page
 */
async function capture(page, outDir, file, fullPage, vp) {
  if (!fullPage) {
    await page.screenshot({ path: path.join(outDir, file) });
    return [file];
  }
  // Scroll through the page first so lazy-loaded images below the fold load, then go back up.
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(window.innerHeight * 0.75)) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle");
  await page.evaluate(() =>
    Promise.all([...document.images].filter((img) => !img.complete).map((img) => new Promise((r) => (img.onload = img.onerror = r)))),
  );
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const partHeight = Math.floor(MAX_CAPTURE_DEVICE_PX / vp.deviceScaleFactor);
  if (height <= partHeight) {
    await page.screenshot({ path: path.join(outDir, file), fullPage: true });
    return [file];
  }
  const files = [];
  for (let y = 0, part = 1; y < height; y += partHeight, part++) {
    const name = file.replace(/\.png$/, `-part${part}.png`);
    await page.screenshot({
      path: path.join(outDir, name),
      fullPage: true,
      clip: { x: 0, y, width: vp.width, height: Math.min(partHeight, height - y) },
    });
    files.push(name);
  }
  return files;
}

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const rest = argv.filter((a) => !a.startsWith("--"));
  const [id, ...targets] = rest;
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
    throw new Error("Usage: npm run review:shots -- <ID> [routes…] [--headed] [--full-page]   (e.g. PF-004 /)");
  }
  for (const f of flags) if (f !== "--headed" && f !== "--full-page") throw new Error(`Unknown option ${f}`);
  return { id, targets, headed: flags.has("--headed"), fullPage: flags.has("--full-page") };
}

async function main() {
  const { id, targets: targetArgs, headed, fullPage } = parseArgs(process.argv.slice(2));
  const targets = resolveTargets(targetArgs);
  const outDir = path.join(ROOT, ".review", id);
  await mkdir(outDir, { recursive: true });

  const server = await startProdServer();
  // channel "chromium": the full Chromium build (new headless mode when headless), which takes
  // the same GPU path as a real browser, rather than the stripped-down headless shell.
  const browser = await chromium.launch({ channel: "chromium", headless: !headed });
  const browserVersion = browser.version();
  const captures = [];
  try {
    for (const target of targets) {
      if (target.download) {
        // A served file (social image, icon): saved as it is, no browser involved.
        const res = await fetch(new URL(target.path, server.origin));
        const body = Buffer.from(await res.arrayBuffer());
        await writeFile(path.join(outDir, target.download), body);
        captures.push({
          target: target.name,
          file: target.download,
          url: target.path,
          status: res.status,
          contentType: res.headers.get("content-type"),
          bytes: body.length,
          timestamp: new Date().toISOString(),
        });
        console.log(`wrote .review/${id}/${target.download}  (${res.status}, ${res.headers.get("content-type")}, ${body.length} bytes)`);
        continue;
      }
      for (const vp of target.viewports ?? VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: vp.deviceScaleFactor,
          isMobile: vp.isMobile,
          hasTouch: vp.hasTouch,
          // e.g. { javaScriptEnabled: false } for a no-JavaScript capture
          ...target.contextOptions,
        });
        const page = await context.newPage();
        const pageUrl = new URL(target.path, server.origin);
        pageUrl.searchParams.set("gpu", CAPTURE_GPU);
        const url = pageUrl.href;
        const response = await page.goto(url, { waitUntil: "load" });
        // At most 15 s: a page may never go quiet (the dev performance overlay keeps creating
        // blob: URLs, PF-007); the target's own `prepare` then decides when it is ready.
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
        await page.evaluate(() => document.fonts.ready);
        if (target.prepare) await target.prepare(page);

        const file = `${target.name}-${vp.name}.png`;
        const files = await capture(page, outDir, file, fullPage, vp);
        const webgl = await page.evaluate(readWebGlInfo, CAPTURE_GPU);
        captures.push({
          target: target.name,
          file: files.length === 1 ? files[0] : files,
          url: url.replace(server.origin, ""),
          status: response?.status() ?? null,
          fullPage,
          viewport: {
            name: vp.name,
            width: vp.width,
            height: vp.height,
            deviceScaleFactor: vp.deviceScaleFactor,
            pixels: `${vp.width * vp.deviceScaleFactor}×${vp.height * vp.deviceScaleFactor}`,
          },
          timestamp: new Date().toISOString(),
          webgl: {
            powerPreference: CAPTURE_GPU,
            ...webgl,
            gpu: webgl.available
              ? SOFTWARE_RENDERER.test(webgl.renderer ?? "")
                ? "software (not a real GPU)"
                : "hardware"
              : "no WebGL context",
          },
        });
        await context.close();
        for (const f of files) {
          console.log(`wrote .review/${id}/${f}  (${vp.width}×${vp.height} @${vp.deviceScaleFactor}x)`);
        }
      }
    }
  } finally {
    await browser.close();
    await server.stop();
  }

  // Several runs may write into one folder (e.g. a second build with ENABLE_DEV_PAGES=1): keep the
  // earlier captures, replacing those this run took again.
  const manifestPath = path.join(outDir, "capture.json");
  /** @type {any[]} */
  let earlier = [];
  try {
    earlier = JSON.parse(await readFile(manifestPath, "utf8")).captures ?? [];
  } catch {
    earlier = [];
  }
  const key = (c) => `${c.target}|${c.viewport?.name ?? "file"}`;
  const taken = new Set(captures.map(key));
  const manifest = {
    id,
    createdAt: new Date().toISOString(),
    browser: `Chromium ${browserVersion} (Playwright, ${headed ? "headed" : "headless"})`,
    platform: `${process.platform} ${process.arch}`,
    server: "next start (production build), local free port",
    devPages: process.env.ENABLE_DEV_PAGES === "1",
    captures: [...earlier.filter((c) => !taken.has(key(c))), ...captures],
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const renderers = [...new Set(captures.filter((c) => c.webgl).map((c) => `${c.webgl.renderer ?? "none"} → ${c.webgl.gpu}`))];
  console.log(`wrote .review/${id}/capture.json`);
  console.log(`WebGL renderer: ${renderers.join(" | ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
