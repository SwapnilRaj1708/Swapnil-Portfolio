// Numbers: npm run numbers -- <ID> [stops…] [--headless]
//
// Builds the site (the npm script runs `npm run build` first), serves it with `next start` on a
// free port and, in Playwright's full Chromium on the machine's real GPU (the launch method of
// review:shots – never the headless shell, which renders with SwiftShader), loads every stop with
// each forced tier (`?tier=high|medium|low`, allowed off the production deployment) and records:
//   draw calls, triangles, geometries, textures, estimated texture memory on the GPU,
//   frame time p50 / p95 / p99 over a fixed window after a warm-up, the CPU time of each frame,
//   the tier actually active and the pixel ratio used.
// Plus "medium (throttled)": the high tier with CDP CPU throttling 4× (STANDARDS §3: medium's
// frame-time budget is measured on the reference laptop, throttled).
//
// GPU (D-40, owner decision on PF-007): visitors' canvases ask for powerPreference
// "high-performance". These measured runs add `?gpu=low-power` (allowed off the production
// deployment), so the reference laptop is measured on its integrated AMD Radeon. One more run,
// "visitor default", loads `?tier=high` without it – information only, not judged – and the
// report names the renderer that run got (on a dual-GPU laptop: did the browser switch GPUs?).
//
// Writes .review/<ID>/numbers.json and numbers.md with the URL, viewport, timestamp, browser, the
// WebGL vendor / renderer (and whether it is hardware, as capture.json records it) and the machine
// (Windows: Win32_ComputerSystem manufacturer and model, Win32_VideoController names).
//
// Frame times: the interval between animation frames. Headed (the default) Chromium paces
// requestAnimationFrame to the display's refresh, so intervals are vsync-capped: a scene that keeps
// up measures the refresh interval (16.7 ms at 60 Hz, 6.9 ms at 144 Hz), one that misses frames
// measures multiples of it. `--headless` (new headless mode, still the real GPU) paces frames by a
// timer instead; the file records which. The CPU time per frame (updates + the render call) is not
// capped and shows the headroom left under vsync.
//
// D-40: the reference laptop is measured on its integrated AMD Radeon GPU. If the measured runs'
// renderer string does not name AMD, the script warns loudly (it does not fail).

import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { ROOT, startProdServer } from "./lib/prod-server.mjs";
import { resolveStops } from "./review/targets.mjs";

const WARMUP_MS = 3000;
const SAMPLE_MS = 10_000;
const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1 };
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render/i;

/** STANDARDS.md §3, per frame. */
const LIMITS = {
  high: { drawCalls: 120, triangles: 600_000, textureBytes: 160e6, p95: 16.7, device: "reference laptop" },
  "medium (throttled)": { drawCalls: 90, triangles: 350_000, textureBytes: 100e6, p95: 20, device: "reference laptop, throttled" },
  medium: { drawCalls: 90, triangles: 350_000, textureBytes: 100e6, p95: 20, device: "reference laptop, throttled (this run: unthrottled)" },
  low: { drawCalls: 60, triangles: 150_000, textureBytes: 48e6, p95: 33, device: "reference phone (this run: the laptop)" },
};

/** The measured runs ask for the integrated GPU; the last run is the visitor default, information only. */
const RUNS = [
  { label: "high", tier: "high", cpuThrottle: 1, gpu: "low-power" },
  { label: "medium", tier: "medium", cpuThrottle: 1, gpu: "low-power" },
  { label: "low", tier: "low", cpuThrottle: 1, gpu: "low-power" },
  { label: "medium (throttled)", tier: "high", cpuThrottle: 4, gpu: "low-power" },
  { label: "visitor default (high-performance)", tier: "high", cpuThrottle: 1, gpu: null, informational: true },
];

/** The visitor-default run is judged against nothing; its row shows high's limits for reference. */
const limitsFor = (run) => LIMITS[run] ?? LIMITS.high;

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const rest = argv.filter((a) => !a.startsWith("--"));
  const [id, ...stops] = rest;
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) throw new Error("Usage: npm run numbers -- <ID> [stops…] [--headless]   (e.g. PF-007 /)");
  for (const f of flags) if (f !== "--headless") throw new Error(`Unknown option ${f}`);
  return { id, stops, headless: flags.has("--headless") };
}

/** The machine, so ROSTER.md can name the exact model (Windows; elsewhere: platform only). */
function readMachine() {
  if (process.platform !== "win32") return { platform: `${process.platform} ${process.arch}` };
  const script =
    "$cs = Get-CimInstance Win32_ComputerSystem; $vc = Get-CimInstance Win32_VideoController; $cpu = Get-CimInstance Win32_Processor; " +
    "[pscustomobject]@{ manufacturer = $cs.Manufacturer; model = $cs.Model; systemFamily = $cs.SystemFamily; memoryGB = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1); " +
    "cpu = ($cpu | Select-Object -First 1).Name.Trim(); gpus = @($vc | ForEach-Object { $_.Name }) } | ConvertTo-Json -Compress";
  const out = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" });
  try {
    return { platform: `${process.platform} ${process.arch}`, ...JSON.parse(out.stdout.trim()) };
  } catch {
    return { platform: `${process.platform} ${process.arch}`, error: (out.stderr || "could not read the machine").trim() };
  }
}

/** The WebGL renderer a context with this powerPreference gets (as capture.json records it). Runs in the browser. */
function readWebGlInfo(powerPreference) {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", { powerPreference });
  if (!gl) return { available: false, vendor: null, renderer: null, version: null };
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const info = {
    available: true,
    vendor: String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
    renderer: String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
    version: String(gl.getParameter(gl.VERSION)),
  };
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return info;
}

const ms = (v) => (typeof v === "number" ? v.toFixed(2) : "–");
const mb = (b) => `${(b / 1e6).toFixed(2)} MB`;

async function measure(browser, origin, stop, run) {
  const context = await browser.newContext({ viewport: { width: VIEWPORT.width, height: VIEWPORT.height }, deviceScaleFactor: VIEWPORT.deviceScaleFactor });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const url = new URL(stop.path, origin);
  url.searchParams.set("tier", run.tier);
  if (run.gpu) url.searchParams.set("gpu", run.gpu);
  await page.goto(url.href, { waitUntil: "load" });
  if (stop.prepare) await stop.prepare(page);
  await page.waitForFunction(() => window.__journey?.ready === true, null, { timeout: 60_000 });
  const cdp = await context.newCDPSession(page);
  if (run.cpuThrottle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: run.cpuThrottle });
  await page.waitForTimeout(WARMUP_MS);
  const sample = await page.evaluate((d) => window.__journey.sample(d), SAMPLE_MS);
  const result = await page.evaluate(() => ({
    stats: window.__journey.stats(),
    state: window.__journey.state(),
    devTools: !!document.querySelector("[data-dev-panel], #leva__root"),
  }));
  if (run.cpuThrottle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const webgl = await page.evaluate(readWebGlInfo, run.gpu ?? "high-performance");
  await context.close();
  return {
    stop: stop.name,
    run: run.label,
    url: url.href.replace(origin, ""),
    cpuThrottle: run.cpuThrottle,
    informational: !!run.informational,
    powerPreference: result.stats.powerPreference,
    renderer: result.stats.renderer,
    tierActive: result.state.tier,
    tierReason: result.state.reason,
    pixelRatio: result.stats.pixelRatio,
    drawCalls: result.stats.drawCalls,
    triangles: result.stats.triangles,
    geometries: result.stats.geometries,
    textures: result.stats.textures,
    textureBytes: result.stats.textureBytes,
    programs: result.stats.programs,
    frames: sample.frames,
    sampleMs: Math.round(sample.durationMs),
    frameTimeMs: { p50: sample.intervalP50, p95: sample.intervalP95, p99: sample.intervalP99 },
    cpuTimeMs: { p50: sample.cpuP50, p95: sample.cpuP95, p99: sample.cpuP99 },
    devToolsShown: result.devTools,
    errors,
    webgl,
  };
}

function judge(r) {
  const l = limitsFor(r.run);
  return {
    drawCalls: r.drawCalls <= l.drawCalls,
    triangles: r.triangles <= l.triangles,
    textureBytes: r.textureBytes <= l.textureBytes,
    p95: r.frameTimeMs.p95 <= l.p95,
  };
}

function toMarkdown(report) {
  const lines = [
    `# Numbers – ${report.id}`,
    "",
    `- Measured: ${report.createdAt}`,
    `- Machine: ${report.machine.manufacturer ?? ""} ${report.machine.model ?? ""} (${report.machine.systemFamily ?? ""}), ${report.machine.cpu ?? ""}, ${report.machine.memoryGB ?? "?"} GB; GPUs: ${(report.machine.gpus ?? []).join(" / ")}`,
    `- WebGL (measured runs, ?gpu=low-power): ${report.webgl.vendor} – ${report.webgl.renderer} (${report.webgl.gpu})`,
    `- Visitor default (powerPreference "high-performance", information only): ${report.visitorDefault ? `${report.visitorDefault.renderer} – ${report.visitorDefault.sameGpu ? "the same GPU as the measured runs" : "a different GPU from the measured runs"}` : "not run"}`,
    `- Browser: ${report.browser}; frames ${report.framePacing}`,
    `- Viewport: ${report.viewport.width}×${report.viewport.height} @${report.viewport.deviceScaleFactor}x; warm-up ${report.warmupMs} ms, sample ${report.sampleMs} ms`,
    "",
    "| Stop | Run | GPU asked / canvas renderer | Tier active | Pixel ratio | Draw calls | Triangles | Geometries | Textures | Texture memory | Frame p50 / p95 / p99 (ms) | CPU p50 / p95 / p99 (ms) | p95 limit | Within budget |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of report.results) {
    const j = judge(r);
    const verdict = Object.values(j).every(Boolean) ? "yes" : `no (${Object.entries(j).filter(([, v]) => !v).map(([k]) => k).join(", ")})`;
    const ok = r.informational ? `information only (${verdict} against high)` : verdict;
    lines.push(
      `| ${r.stop} | ${r.run} | ${r.powerPreference ?? "?"} / ${r.renderer ?? "?"} | ${r.tierActive} | ${r.pixelRatio} | ${r.drawCalls} | ${r.triangles} | ${r.geometries} | ${r.textures} | ${mb(r.textureBytes)} | ${ms(r.frameTimeMs.p50)} / ${ms(r.frameTimeMs.p95)} / ${ms(r.frameTimeMs.p99)} | ${ms(r.cpuTimeMs.p50)} / ${ms(r.cpuTimeMs.p95)} / ${ms(r.cpuTimeMs.p99)} | ≤ ${limitsFor(r.run).p95} (${limitsFor(r.run).device}) | ${ok} |`,
    );
  }
  lines.push("", "Texture memory: textures the scene's materials use (width × height × 4 bytes, + ⅓ for mipmaps). `Textures` is three.js's count, which also includes the renderer's own internal ones.", "");
  return lines.join("\n");
}

async function main() {
  const { id, stops: stopArgs, headless } = parseArgs(process.argv.slice(2));
  const stops = resolveStops(stopArgs);
  const outDir = path.join(ROOT, ".review", id);
  await mkdir(outDir, { recursive: true });
  const machine = readMachine();

  const server = await startProdServer();
  const browser = await chromium.launch({ channel: "chromium", headless });
  const results = [];
  let webgl;
  try {
    for (const stop of stops) {
      for (const run of RUNS) {
        const r = await measure(browser, server.origin, stop, run);
        if (!run.informational) webgl ??= r.webgl;
        results.push(r);
        console.log(
          `${stop.name} ${run.label}: ${r.powerPreference} → ${r.renderer}; tier ${r.tierActive}, dpr ${r.pixelRatio}, ${r.drawCalls} draw calls, ${r.triangles} triangles, ` +
            `frame p50/p95/p99 ${ms(r.frameTimeMs.p50)}/${ms(r.frameTimeMs.p95)}/${ms(r.frameTimeMs.p99)} ms, CPU p95 ${ms(r.cpuTimeMs.p95)} ms`,
        );
        if (r.devToolsShown) console.warn("WARNING: the dev tools are shown on this page – their cost is in these numbers.");
        if (r.errors.length) console.warn(`WARNING: page errors: ${r.errors.join(" | ")}`);
      }
    }
  } finally {
    await browser.close();
    await server.stop();
  }

  const gpu = !webgl?.available ? "no WebGL context" : SOFTWARE_RENDERER.test(webgl.renderer ?? "") ? "software (not a real GPU)" : "hardware";
  const measuredRenderers = [...new Set(results.filter((r) => !r.informational).map((r) => r.renderer))];
  const visitor = results.find((r) => r.informational);
  const visitorDefault = visitor
    ? {
        powerPreference: visitor.powerPreference,
        renderer: visitor.renderer,
        probeRenderer: visitor.webgl.renderer,
        sameGpu: measuredRenderers.length === 1 && measuredRenderers[0] === visitor.renderer,
      }
    : null;
  const report = {
    id,
    createdAt: new Date().toISOString(),
    machine,
    browser: `Chromium ${browser.version()} (Playwright, full Chromium, ${headless ? "new headless mode" : "headed"})`,
    framePacing: headless
      ? "paced by Chromium's headless frame timer (not the display); intervals are not vsync-capped"
      : "paced by the display (headed): requestAnimationFrame is vsync-capped, so intervals are multiples of the refresh interval",
    server: "next start (production build), local free port",
    viewport: VIEWPORT,
    warmupMs: WARMUP_MS,
    sampleMs: SAMPLE_MS,
    webgl: { ...webgl, gpu, canvasRenderers: measuredRenderers },
    visitorDefault,
    limits: LIMITS,
    results: results.map((r) => {
      const { webgl: _webgl, ...rest } = r; // eslint-disable-line @typescript-eslint/no-unused-vars -- recorded once, above
      return { ...rest, withinBudget: judge(r) };
    }),
  };
  await writeFile(path.join(outDir, "numbers.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(outDir, "numbers.md"), `${toMarkdown(report)}\n`);
  console.log(`wrote .review/${id}/numbers.json and numbers.md`);
  console.log(`WebGL renderer (measured runs, low-power): ${measuredRenderers.join(" | ") || webgl?.renderer || "none"} → ${gpu}`);
  if (visitorDefault) {
    console.log(`Visitor default (high-performance, information only): ${visitorDefault.renderer} – ${visitorDefault.sameGpu ? "same GPU as the measured runs" : "a DIFFERENT GPU from the measured runs"}`);
  }
  console.log(`Machine: ${machine.manufacturer ?? ""} ${machine.model ?? ""} – GPUs: ${(machine.gpus ?? []).join(" / ")}`);
  if (!measuredRenderers.length || !measuredRenderers.every((r) => /AMD/i.test(r ?? ""))) {
    const bar = "!".repeat(78);
    console.warn(`\n${bar}\nWARNING (D-40): the renderer does not name AMD. The reference laptop is measured on its\nintegrated AMD Radeon GPU; these numbers came from: ${measuredRenderers.join(" | ") || "no WebGL"}\n${bar}\n`);
  }
  if (gpu !== "hardware") console.warn("WARNING: not a hardware GPU – frame times here say nothing about the reference devices.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
