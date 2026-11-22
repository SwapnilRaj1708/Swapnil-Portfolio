// Review screenshots: npm run review:shots -- <ID> [routes or named targets…] [--headed]
//
// Builds the site (the npm script runs `next build` first), serves it with `next start` on a
// free port, and captures every target on a desktop (1440×900) and a phone (390×844) viewport
// into .review/<ID>/ as <target>-desktop.png and <target>-phone.png. It also writes
// .review/<ID>/capture.json with the viewport, URL, timestamp and the WebGL renderer the page
// reports, so a review can tell a software renderer (SwiftShader) from a real GPU.
//
// --headed  runs a visible browser window, which normally gets the real GPU.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { resolveTargets, VIEWPORTS } from "./review/targets.mjs";
import { ROOT, startProdServer } from "./lib/prod-server.mjs";

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render/i;

/** Reads the WebGL renderer the page actually gets (runs inside the browser). */
function readWebGlInfo() {
  const canvas = document.createElement("canvas");
  const gl2 = canvas.getContext("webgl2");
  const gl = gl2 ?? canvas.getContext("webgl");
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

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const rest = argv.filter((a) => !a.startsWith("--"));
  const [id, ...targets] = rest;
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
    throw new Error("Usage: npm run review:shots -- <ID> [routes…] [--headed]   (e.g. PF-004 /)");
  }
  for (const f of flags) if (f !== "--headed") throw new Error(`Unknown option ${f}`);
  return { id, targets, headed: flags.has("--headed") };
}

async function main() {
  const { id, targets: targetArgs, headed } = parseArgs(process.argv.slice(2));
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
      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: vp.deviceScaleFactor,
          isMobile: vp.isMobile,
          hasTouch: vp.hasTouch,
        });
        const page = await context.newPage();
        const url = new URL(target.path, server.origin).href;
        const response = await page.goto(url, { waitUntil: "load" });
        await page.waitForLoadState("networkidle");
        await page.evaluate(() => document.fonts.ready);
        if (target.prepare) await target.prepare(page);

        const file = `${target.name}-${vp.name}.png`;
        await page.screenshot({ path: path.join(outDir, file) });
        const webgl = await page.evaluate(readWebGlInfo);
        captures.push({
          target: target.name,
          file,
          url: url.replace(server.origin, ""),
          status: response?.status() ?? null,
          viewport: {
            name: vp.name,
            width: vp.width,
            height: vp.height,
            deviceScaleFactor: vp.deviceScaleFactor,
            pixels: `${vp.width * vp.deviceScaleFactor}×${vp.height * vp.deviceScaleFactor}`,
          },
          timestamp: new Date().toISOString(),
          webgl: {
            ...webgl,
            gpu: webgl.available
              ? SOFTWARE_RENDERER.test(webgl.renderer ?? "")
                ? "software (not a real GPU)"
                : "hardware"
              : "no WebGL context",
          },
        });
        await context.close();
        console.log(`wrote .review/${id}/${file}  (${vp.width}×${vp.height} @${vp.deviceScaleFactor}x)`);
      }
    }
  } finally {
    await browser.close();
    await server.stop();
  }

  const manifest = {
    id,
    createdAt: new Date().toISOString(),
    browser: `Chromium ${browserVersion} (Playwright, ${headed ? "headed" : "headless"})`,
    platform: `${process.platform} ${process.arch}`,
    server: "next start (production build), local free port",
    captures,
  };
  await writeFile(path.join(outDir, "capture.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const renderers = [...new Set(captures.map((c) => `${c.webgl.renderer ?? "none"} → ${c.webgl.gpu}`))];
  console.log(`wrote .review/${id}/capture.json`);
  console.log(`WebGL renderer: ${renderers.join(" | ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
