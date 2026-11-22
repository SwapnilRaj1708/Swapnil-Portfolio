// Size report: first-load JavaScript per route, against budgets.config.mjs.
//
// Usage: npm run build && npm run size
//
// For every page route in the production build, it starts `next start`, fetches the
// route's HTML, collects every JavaScript file that HTML loads (<script src> and
// <link rel="preload|modulepreload" as="script">; `nomodule` polyfills are skipped because
// modern browsers never load them), compresses each file with gzip (zlib default level,
// as `next start` serves it) and Brotli (quality 11), and sums them per route.
// Exit code 1 if any route is over its limit.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
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

async function main() {
  const { routes, problems } = await discoverRoutes();
  const limit = budgets.firstLoadJs.gzipBytes;
  const server = await startProdServer();
  /** @type {Map<string, { gzip: number, brotli: number, raw: number }>} */
  const fileSizes = new Map();
  const rows = [];
  /** @type {Set<string>} */
  const polyfills = new Set();

  /** Fetches one JS file once and returns its raw, gzip and Brotli sizes. */
  const measure = async (url) => {
    let sizes = fileSizes.get(url);
    if (!sizes) {
      const jsRes = await fetch(new URL(url, server.origin));
      if (!jsRes.ok) throw new Error(`${url}: HTTP ${jsRes.status}`);
      const body = Buffer.from(await jsRes.arrayBuffer());
      sizes = {
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
      }
      for (const url of noModuleUrls(html)) polyfills.add(url);
      rows.push({ label: route.label, files: files.length, raw, gzip, brotli, ok: gzip <= limit });
    }
    for (const url of polyfills) await measure(url);
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

  for (const p of problems) console.error(`ERROR: ${p}`);
  const over = rows.filter((r) => !r.ok);
  for (const r of over) console.error(`OVER BUDGET: ${r.label} is ${fmt(r.gzip)} gzip, limit ${fmt(limit)}`);
  if (over.length || problems.length) process.exit(1);
  console.log("All routes within budget.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
