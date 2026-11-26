// Size report: first-load JavaScript per route, against budgets.config.mjs.
//
// Usage: npm run build && npm run size
//
// For every page route in the production build, it starts `next start`, fetches the
// route's HTML, collects every JavaScript file that HTML loads (<script src> and
// <link rel="preload|modulepreload" as="script">; `nomodule` polyfills are skipped because
// modern browsers never load them), compresses each file with gzip (zlib default level,
// as `next start` serves it) and Brotli (quality 11), and sums them per route.
// Then the page weight of each fast-lane route (budgets.pageWeight): every byte the page
// transfers in Chromium (desktop and phone viewports), lazy images included.
// Then the stage 1 stills (budgets.stills, PF-028): each master in public/media/stills/ as
// next/image serves it at the largest size the layout uses, in AVIF and in WebP.
// Then the 3D layer (PF-007, PF-008, budgets.threeDChunk):
//   - no route's first-load JS contains three.js, React Three Fiber, gsap / ScrollTrigger, Lenis or
//     the camera rig;
//   - where the build has the 3D layer (not the production deployment, D-39): the lazy journey
//     chunks – the JS files `/` loads in Chromium with `?tier=high` beyond those it loads with
//     `?tier=static` (three, R3F, the scene, the scroll spine's gsap + ScrollTrigger + Lenis, the
//     rig) – summed and gated at ≤ 400 KB gzip;
//   - where it does not: no file in .next/static contains any of those or the loader;
//   - PF-009: the asset loaders (KTX2Loader, contract, chapter assets) are among the lazy chunks too;
//     the decoders in public/decoders/ are reported separately (raw, gzip, Brotli) and must be
//     absent from a build without the 3D layer;
//   - the dev tools (leva, r3f-perf) are in no file of the build unless it was made with
//     ENABLE_DEV_PAGES=1 (then they are reported, not gated).
// Exit code 1 if anything is over its limit.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { budgets, KB } from "../budgets.config.mjs";
import { ROOT, startProdServer } from "./lib/prod-server.mjs";

/** Page routes from the build's route manifest, plus the 404 page. */
async function discoverRoutes() {
  const manifestPath = path.join(ROOT, ".next", "app-path-routes-manifest.json");
  /** @type {Record<string, string>} */
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  /** @type {{ label: string, path: string, expectStatus: number }[]} */
  const routes = [];
  /** @type {string[]} */
  const problems = [];

  for (const [entry, route] of Object.entries(manifest)) {
    if (!entry.endsWith("/page")) continue; // route handlers (robots.txt, APIs) serve no HTML
    if (route === "/_global-error") continue; // only rendered when the app itself crashes
    if (route === "/_not-found") {
      routes.push({ label: "404 page", path: "/__size-report-not-found__", expectStatus: 404 });
      continue;
    }
    if (route.includes("[")) {
      /** @type {Record<string, string[]>} */
      const samples = budgets.dynamicRouteSamples;
      const list = samples[route] ?? [];
      if (list.length === 0) problems.push(`dynamic route ${route} has no sample path in budgets.config.mjs`);
      for (const p of list) routes.push({ label: `${route} (${p})`, path: p, expectStatus: 200 });
      continue;
    }
    routes.push({ label: route, path: route, expectStatus: 200 });
  }
  routes.sort((a, b) => a.label.localeCompare(b.label));
  return { routes, problems };
}

/** `nomodule` script URLs (legacy polyfills): reported, not counted. */
function noModuleUrls(html) {
  const urls = new Set();
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (!/\snomodule\b/i.test(tag)) continue;
    const src = /\ssrc="([^"]+)"/i.exec(tag)?.[1];
    if (src) urls.add(src.replaceAll("&amp;", "&"));
  }
  return [...urls];
}

/** Every JS URL the HTML loads, in document order, without duplicates. */
function scriptUrls(html) {
  const urls = new Set();
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (/\snomodule\b/i.test(tag)) continue;
    const src = /\ssrc="([^"]+)"/i.exec(tag)?.[1];
    if (src) urls.add(src);
  }
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\srel="([^"]+)"/i.exec(tag)?.[1] ?? "";
    const as = /\sas="([^"]+)"/i.exec(tag)?.[1] ?? "";
    const href = /\shref="([^"]+)"/i.exec(tag)?.[1];
    if (!href) continue;
    if (rel === "modulepreload" || (rel === "preload" && as === "script")) urls.add(href);
  }
  return [...urls].map((u) => u.replaceAll("&amp;", "&"));
}

const fmt = (bytes) => `${(bytes / KB).toFixed(1)} KB`;

/** Strings that identify a package in built JavaScript (they survive minification). */
const SIGNATURES = {
  three: "__THREE__",
  "react-three-fiber": "R3F: Hooks can only be used",
  "journey loader": "journey-tier-floor",
  // PF-008: the scroll spine's libraries and the camera rig.
  gsap: "GSAP target",
  scrolltrigger: '"ScrollTrigger"',
  lenis: "lenis-smooth",
  "camera rig": "world-path.json",
  // PF-009: the asset loaders (KTX2Loader and the contract code, in the lazy chunks).
  "asset loaders": "THREE.KTX2Loader:",
  leva: "leva__root",
  "r3f-perf": "muiPerf",
};
/** May only ever load lazily, with the 3D layer: never in a route's first-load JS. */
const THREE_D = ["three", "react-three-fiber", "gsap", "scrolltrigger", "lenis", "camera rig", "asset loaders"];
const DEV_TOOLS = ["leva", "r3f-perf"];

/** Which signatures a file contains. */
function signaturesIn(body) {
  const text = body.toString("latin1");
  return Object.entries(SIGNATURES)
    .filter(([, sig]) => text.includes(sig))
    .map(([name]) => name);
}

/** Every built JavaScript file and the signatures it contains. */
async function scanStaticJs() {
  const dir = path.join(ROOT, ".next", "static");
  const files = (await readdir(dir, { recursive: true })).filter((f) => f.endsWith(".js"));
  /** @type {Record<string, string[]>} name → files */
  const found = Object.fromEntries(Object.keys(SIGNATURES).map((k) => [k, []]));
  for (const f of files) {
    for (const name of signaturesIn(await readFile(path.join(dir, f)))) found[name].push(f.replaceAll("\\", "/"));
  }
  return { count: files.length, found };
}

async function main() {
  const { routes, problems } = await discoverRoutes();
  const limit = budgets.firstLoadJs.gzipBytes;
  const server = await startProdServer();
  /** @type {Map<string, { gzip: number, brotli: number, raw: number, hits: string[] }>} */
  const fileSizes = new Map();
  const rows = [];
  /** @type {Set<string>} */
  const polyfills = new Set();
  let journeyBuilt = false;
  /** @type {Awaited<ReturnType<typeof measureThreeDChunk>> | null} */
  let chunk = null;

  /** Fetches one JS file once and returns its raw, gzip and Brotli sizes. */
  const measure = async (url) => {
    let sizes = fileSizes.get(url);
    if (!sizes) {
      const jsRes = await fetch(new URL(url, server.origin));
      if (!jsRes.ok) throw new Error(`${url}: HTTP ${jsRes.status}`);
      const body = Buffer.from(await jsRes.arrayBuffer());
      sizes = {
        hits: signaturesIn(body),
        raw: body.length,
        gzip: gzipSync(body).length,
        brotli: brotliCompressSync(body, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
        }).length,
      };
      fileSizes.set(url, sizes);
    }
    return sizes;
  };

  try {
    for (const route of routes) {
      const res = await fetch(new URL(route.path, server.origin));
      const html = await res.text();
      if (res.status !== route.expectStatus) {
        problems.push(`${route.label}: expected HTTP ${route.expectStatus}, got ${res.status}`);
      }
      let raw = 0;
      let gzip = 0;
      let brotli = 0;
      const files = scriptUrls(html);
      for (const url of files) {
        const sizes = await measure(url);
        raw += sizes.raw;
        gzip += sizes.gzip;
        brotli += sizes.brotli;
        const heavy = sizes.hits.filter((h) => THREE_D.includes(h));
        if (heavy.length) problems.push(`${route.label}: first-load JS ${url} contains ${heavy.join(" and ")} (it may only load lazily)`);
      }
      if (route.path === "/") journeyBuilt = html.includes("data-tier-backdrop");
      for (const url of noModuleUrls(html)) polyfills.add(url);
      rows.push({ label: route.label, files: files.length, raw, gzip, brotli, ok: gzip <= limit });
    }
    for (const url of polyfills) await measure(url);
    if (journeyBuilt) chunk = await measureThreeDChunk(server.origin, measure);
  } finally {
    await server.stop();
  }

  const header = ["Route", "JS files", "Raw", "Brotli", "Gzip (gated)", "Limit", "Result"];
  const table = rows.map((r) => [
    r.label,
    String(r.files),
    fmt(r.raw),
    fmt(r.brotli),
    fmt(r.gzip),
    `≤ ${fmt(limit)}`,
    r.ok ? "ok" : "OVER",
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log("\nFirst-load JS per route (STANDARDS.md §3, compressed transfer size)\n");
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of table) console.log(line(row));
  console.log("");
  for (const url of polyfills) {
    const s = /** @type {{ gzip: number, brotli: number }} */ (fileSizes.get(url));
    console.log(
      `Not counted: nomodule polyfill ${url} (${fmt(s.gzip)} gzip, ${fmt(s.brotli)} Brotli) – ` +
        "only browsers without ES module support load it.",
    );
  }
  if (polyfills.size) console.log("");

  const weightServer = await startProdServer();
  /** @type {Awaited<ReturnType<typeof measurePageWeights>>} */
  let weights;
  /** @type {Awaited<ReturnType<typeof measureStills>>} */
  let stills;
  try {
    weights = await measurePageWeights(weightServer.origin);
    stills = await measureStills(weightServer.origin);
  } finally {
    await weightServer.stop();
  }
  printPageWeights(weights);
  printStills(stills);

  const scan = await scanStaticJs();
  const devPagesBuild = routes.some((r) => r.path.startsWith("/dev/"));
  printThreeD({ journeyBuilt, chunk, scan, devPagesBuild, problems });
  await printDecoders({ journeyBuilt, problems });

  for (const p of problems) console.error(`ERROR: ${p}`);
  const over = rows.filter((r) => !r.ok);
  for (const r of over) console.error(`OVER BUDGET: ${r.label} is ${fmt(r.gzip)} gzip, limit ${fmt(limit)}`);
  const heavy = weights.filter((w) => w.gated && !w.ok);
  for (const w of heavy) {
    console.error(`OVER BUDGET: ${w.route} (${w.viewport}) transfers ${fmt(w.total)}, limit ${fmt(budgets.pageWeight.bytes)}`);
  }
  const heavyStills = stills.filter((s) => !s.ok);
  for (const s of heavyStills) {
    console.error(`OVER BUDGET: ${s.file} served as ${s.problem ?? `AVIF ${fmt(s.avif)} / WebP ${fmt(s.webp)}`}, limit ${fmt(budgets.stills.maxServedBytes)}`);
  }
  const heavyChunk = !!chunk && chunk.gzip > budgets.threeDChunk.gzipBytes;
  if (heavyChunk) console.error(`OVER BUDGET: the lazy journey chunks sum to ${fmt(chunk.gzip)} gzip, limit ${fmt(budgets.threeDChunk.gzipBytes)}`);
  if (over.length || problems.length || heavy.length || heavyStills.length || heavyChunk) process.exit(1);
  console.log("All routes within budget.");
}

/**
 * The lazy 3D chunk: the JS files `/` loads with the canvas (`?tier=high`) that it does not load in
 * the static tier (`?tier=static`) – same page, same viewport, so route prefetches cancel out.
 * Playwright's default Chromium (SwiftShader is enough to start the canvas).
 */
async function measureThreeDChunk(origin, measure) {
  const browser = await chromium.launch();
  const scriptsFor = async (query) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const urls = new Set();
    page.on("response", (res) => {
      if (res.request().resourceType() === "script" && res.url().startsWith(origin)) urls.add(res.url().slice(origin.length));
    });
    await page.goto(`${origin}/${query}`, { waitUntil: "load" });
    const done = await page
      .waitForFunction(() => window.__journey?.ready === true || window.__journey?.state().tier === "static", null, { timeout: 30_000 })
      .then(
        () => true,
        () => false,
      );
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => window.__journey?.state() ?? null);
    await context.close();
    return { urls, done, state };
  };
  try {
    const base = await scriptsFor("?tier=static");
    const canvas = await scriptsFor("?tier=high");
    if (!canvas.done || canvas.state?.tier !== "high") {
      return { files: [], gzip: 0, brotli: 0, raw: 0, error: `the canvas did not start with ?tier=high (tier: ${canvas.state?.tier ?? "none"}, reason: ${canvas.state?.reason ?? "–"})` };
    }
    const files = [...canvas.urls].filter((u) => !base.urls.has(u)).sort();
    const rows = [];
    for (const url of files) rows.push({ url, ...(await measure(url)) });
    const sum = (k) => rows.reduce((t, r) => t + r[k], 0);
    // PF-008: the scroll spine (gsap, ScrollTrigger, Lenis) and the camera rig load with the scene.
    // PF-009: and the asset loaders (KTX2Loader, the contract, the chapter assets).
    const missing = ["three", "gsap", "scrolltrigger", "lenis", "camera rig", "asset loaders"].filter((name) => !rows.some((r) => r.hits.includes(name)));
    return {
      files: rows,
      gzip: sum("gzip"),
      brotli: sum("brotli"),
      raw: sum("raw"),
      error: missing.length ? `no lazily loaded file contains ${missing.join(", ")}` : null,
    };
  } finally {
    await browser.close();
  }
}

function printThreeD({ journeyBuilt, chunk, scan, devPagesBuild, problems }) {
  console.log("3D layer (PF-007, PF-008; STANDARDS.md §3: the lazy journey chunks ≤ 400 KB gzip together; never in first-load JS)\n");
  const where = (name) => (scan.found[name].length ? scan.found[name].join(", ") : "–");
  if (journeyBuilt) {
    if (!chunk || chunk.error) {
      problems.push(`3D chunk: ${chunk?.error ?? "not measured"}`);
    } else {
      console.log(`Lazy journey chunks (loaded by / after the page is interactive: three, R3F, the scene, gsap + ScrollTrigger, Lenis, the rig, the asset loaders), ${chunk.files.length} file(s):`);
      for (const f of chunk.files) console.log(`  ${f.url}  ${fmt(f.gzip)} gzip, ${fmt(f.brotli)} Brotli, ${fmt(f.raw)} raw  [${f.hits.join(", ") || "scene code"}]`);
      const limit = budgets.threeDChunk.gzipBytes;
      console.log(`  Sum: ${fmt(chunk.gzip)} gzip (gated, ≤ ${fmt(limit)}: ${chunk.gzip <= limit ? "ok" : "OVER"}), ${fmt(chunk.brotli)} Brotli, ${fmt(chunk.raw)} raw`);
    }
  } else {
    console.log("This build has no 3D layer (the production deployment before PF-026, D-39).");
    const names = [...THREE_D, "journey loader"];
    for (const name of names) {
      if (scan.found[name].length) problems.push(`D-39: ${name} found in a build without the 3D layer: ${where(name)}`);
    }
    console.log(`  In .next/static (${scan.count} JS files): ${names.map((n) => `${n} ${scan.found[n].length ? "FOUND" : "absent"}`).join(", ")}`);
  }
  console.log(`  ${THREE_D.join(" / ")} in any route's first-load JS: none (an ERROR line lists any found)`);
  const devFound = DEV_TOOLS.filter((n) => scan.found[n].length);
  if (devPagesBuild) {
    console.log(`  Dev tools (leva, r3f-perf): ENABLE_DEV_PAGES=1 build, present by design: ${devFound.map((n) => `${n} in ${where(n)}`).join("; ") || "none found"} (not gated)`);
  } else {
    console.log(`  Dev tools (leva, r3f-perf) in the build's chunks (${scan.count} JS files searched): ${devFound.length ? "FOUND" : "absent"}`);
    for (const n of devFound) problems.push(`dev tool ${n} found in a build without dev tools: ${where(n)}`);
  }
  console.log("");
}

/**
 * PF-009: the decoders the site serves itself (public/decoders/three-r<REVISION>/, copied from
 * three.js before every build) – reported separately from the JS chunks: they are requested only
 * when an asset loads (never by the home page until PF-010 wires chapter assets). A build without
 * the 3D layer must have none. Also lists the copies the bundler emits for KTX2Loader's default
 * transcoder path (`new URL(…, import.meta.url)`): never requested, the site sets its own path.
 */
async function printDecoders({ journeyBuilt, problems }) {
  const dir = path.join(ROOT, "public", "decoders");
  const files = await readdir(dir, { recursive: true }).then(
    (list) => list.filter((f) => /\.(js|wasm)$/.test(f)).sort(),
    () => [],
  );
  console.log("Decoders served by the site (PF-009; loaded on the first asset load, not part of the lazy chunks above)\n");
  if (!journeyBuilt) {
    if (files.length) problems.push(`D-39: public/decoders/ holds ${files.length} file(s) in a build without the 3D layer`);
    console.log(`  public/decoders/: ${files.length ? "PRESENT" : "absent"} (a build without the 3D layer serves no decoder)\n`);
    return;
  }
  if (!files.length) problems.push("public/decoders/ is empty: `npm run decoders` did not run before the build");
  for (const f of files) {
    const body = await readFile(path.join(dir, f));
    const gzip = gzipSync(body).length;
    const brotli = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
    console.log(`  /decoders/${f.replaceAll("\\", "/")}  ${fmt(body.length)} raw, ${fmt(gzip)} gzip, ${fmt(brotli)} Brotli`);
  }
  const media = await readdir(path.join(ROOT, ".next", "static", "media")).then(
    (list) => list.filter((f) => /basis_transcoder/.test(f)),
    () => [],
  );
  if (media.length) console.log(`  Also emitted by the bundler for KTX2Loader's default path, never requested: ${media.map((f) => `_next/static/media/${f}`).join(", ")}`);
  console.log("");
}

/**
 * The stills as next/image serves them at the largest width the layout can ask for (3840, the
 * largest device size; next/image never enlarges, so this is the master's own width).
 */
async function measureStills(origin) {
  const dir = path.join(ROOT, budgets.stills.dir);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".webp")).sort();
  const max = budgets.stills.maxServedBytes;
  const results = [];
  for (const file of files) {
    const src = `/${path.posix.join(budgets.stills.dir.replace(/^public\//, ""), file)}`;
    const url = new URL(`/_next/image?url=${encodeURIComponent(src)}&w=3840&q=75`, origin);
    const sizes = {};
    let problem = null;
    for (const [format, accept] of [
      ["avif", "image/avif,image/webp,*/*"],
      ["webp", "image/webp,*/*"],
    ]) {
      const res = await fetch(url, { headers: { accept } });
      const body = Buffer.from(await res.arrayBuffer());
      const type = res.headers.get("content-type");
      if (!res.ok || type !== `image/${format}`) problem = `HTTP ${res.status} ${type} for ${format}`;
      sizes[format] = body.length;
    }
    results.push({ file, avif: sizes.avif, webp: sizes.webp, problem, ok: !problem && sizes.avif <= max && sizes.webp <= max });
  }
  return results;
}

function printStills(stills) {
  const limit = budgets.stills.maxServedBytes;
  console.log("Stills as served by next/image at their largest size (PF-028: ≤ 250 KB each)\n");
  const header = ["Still", "AVIF", "WebP", "Limit", "Result"];
  const table = stills.map((s) => [s.file, fmt(s.avif), fmt(s.webp), `≤ ${fmt(limit)}`, s.ok ? "ok" : s.problem ? "ERROR" : "OVER"]);
  const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of table) console.log(line(row));
  console.log("");
}

const WEIGHT_VIEWPORTS = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: "phone", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];

/**
 * Page weight: loads each route in Chromium, scrolls to the bottom so lazy images load, waits
 * for the network to settle and adds up the bytes on the wire of every response (headers plus
 * the encoded body, as served: compressed where the server compresses).
 */
async function measurePageWeights(origin) {
  const { routes, reportOnly } = budgets.pageWeight;
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const route of [...routes, ...reportOnly]) {
      for (const vp of WEIGHT_VIEWPORTS) {
        const context = await browser.newContext({
          viewport: vp.viewport,
          deviceScaleFactor: vp.deviceScaleFactor,
          isMobile: vp.isMobile,
          hasTouch: vp.hasTouch,
        });
        const page = await context.newPage();
        /** @type {Record<string, number>} */
        const byType = {};
        let total = 0;
        let requests = 0;
        const pending = [];
        page.on("requestfinished", (req) => {
          pending.push(
            req.sizes().then((s) => {
              const bytes = s.responseHeadersSize + s.responseBodySize;
              const type = req.resourceType();
              byType[type] = (byType[type] ?? 0) + bytes;
              // Stage 1 stills (PF-028), also counted under "image".
              if (decodeURIComponent(req.url()).includes("/media/stills/")) byType.stills = (byType.stills ?? 0) + bytes;
              total += bytes;
              requests += 1;
            }),
          );
        });
        await page.goto(new URL(route, origin).href, { waitUntil: "load" });
        await page.evaluate(async () => {
          for (let y = 0; y <= document.body.scrollHeight; y += Math.round(window.innerHeight * 0.75)) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 100));
          }
        });
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(300);
        await Promise.all(pending);
        await context.close();
        const gated = routes.includes(route);
        results.push({ route, viewport: vp.name, total, requests, byType, gated, ok: total <= budgets.pageWeight.bytes });
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}

function printPageWeights(weights) {
  const limit = budgets.pageWeight.bytes;
  const header = ["Route", "Viewport", "Requests", "Total", "document", "script", "stylesheet", "font", "image", "(stills)", "other", "Limit", "Result"];
  const known = ["document", "script", "stylesheet", "font", "image"];
  const table = weights.map((w) => {
    const other = Object.entries(w.byType)
      .filter(([type]) => !known.includes(type) && type !== "stills")
      .reduce((sum, [, b]) => sum + b, 0);
    return [
      w.route,
      w.viewport,
      String(w.requests),
      fmt(w.total),
      ...known.map((t) => fmt(w.byType[t] ?? 0)),
      fmt(w.byType.stills ?? 0),
      fmt(other),
      w.gated ? `≤ ${fmt(limit)}` : "report only",
      w.gated ? (w.ok ? "ok" : "OVER") : "–",
    ];
  });
  const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log("Page weight per fast-lane route (STANDARDS.md §3: ≤ 1 MB without video; bytes on the wire)\n");
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of table) console.log(line(row));
  console.log("  (\"(stills)\" = the stage 1 stills, already inside \"image\"; \"other\" = prefetches and data requests made by the page)\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
