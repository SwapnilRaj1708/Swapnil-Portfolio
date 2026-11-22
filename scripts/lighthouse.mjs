// Lighthouse: npm run lighthouse -- [routes…]   (default "/"; local only, not in CI)
//
// Builds the site (the npm script runs `next build` first), serves it with `next start` on a
// free port, and runs Lighthouse CI (`lhci collect`) with the mobile config (Lighthouse's
// default: phone emulation, simulated slow 4G and CPU slowdown) in Playwright's Chromium,
// 3 runs per route. It prints the median of each category score and gates it against
// budgets.config.mjs (STANDARDS.md §3).
//
// Before launch the "is-crawlable" audit fails on purpose (noindex, nofollow – see
// src/config/site.ts). The SEO gate leaves that one audit out, scored the way Lighthouse scores
// a category, and the audit is printed on its own line as "expected before launch".
//
// Output: .lighthouseci/ (raw results) and .lighthouseci/reports/ (HTML + JSON per run),
// both git-ignored.

import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { budgets } from "../budgets.config.mjs";
import { ROOT, startProdServer } from "./lib/prod-server.mjs";

const LHCI = path.join(ROOT, "node_modules", "@lhci", "cli", "src", "cli.js");
const LHCI_DIR = path.join(ROOT, ".lighthouseci");
const REPORTS_DIR = path.join(LHCI_DIR, "reports");
const EXPECTED_BEFORE_LAUNCH = "is-crawlable";

function runLhci(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [LHCI, ...args], {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        LHCI_NO_LIGHTHOUSERC: "1", // only the options given here
        NO_UPDATE_NOTIFIER: "1", // no update check against the npm registry
      },
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(undefined) : reject(new Error(`lhci ${args[0]} exited with ${code}`)),
    );
  });
}

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Category score as Lighthouse computes it (weighted mean), leaving out the given audits. */
function categoryScoreWithout(lhr, categoryId, excluded) {
  const category = lhr.categories[categoryId];
  let sum = 0;
  let weight = 0;
  for (const ref of category.auditRefs) {
    if (ref.weight <= 0 || excluded.includes(ref.id)) continue;
    const score = lhr.audits[ref.id].score;
    if (score === null) return null;
    sum += score * ref.weight;
    weight += ref.weight;
  }
  return weight ? Math.round((sum / weight) * 100) : null;
}

async function main() {
  const routes = process.argv.slice(2);
  if (routes.length === 0) routes.push("/");
  for (const r of routes) if (!r.startsWith("/")) throw new Error(`Route must start with "/": ${r}`);

  const { runs, minScores } = budgets.lighthouse;
  const chromePath = chromium.executablePath();
  const server = await startProdServer();
  console.log(`Serving the production build at ${server.origin}`);
  /** Launch state as the build serves it (X-Robots-Tag is sent only while SITE_LAUNCHED is false). */
  let launched = true;
  try {
    const probe = await fetch(server.origin);
    await probe.arrayBuffer();
    launched = !/noindex/i.test(probe.headers.get("x-robots-tag") ?? "");
    console.log(`Launch switch as served: ${launched ? "launched" : "not launched (noindex, nofollow)"}`);
    await runLhci([
      "collect",
      ...routes.map((r) => `--url=${new URL(r, server.origin).href}`),
      `--numberOfRuns=${runs}`,
      `--chromePath=${chromePath}`,
    ]);
  } finally {
    await server.stop();
  }
  await runLhci(["upload", "--target=filesystem", `--outputDir=${REPORTS_DIR}`]);

  /** @type {Map<string, any[]>} */
  const byRoute = new Map();
  for (const file of await readdir(LHCI_DIR)) {
    if (!/^lhr-.*\.json$/.test(file)) continue;
    const lhr = JSON.parse(await readFile(path.join(LHCI_DIR, file), "utf8"));
    const route = new URL(lhr.requestedUrl).pathname;
    byRoute.set(route, [...(byRoute.get(route) ?? []), lhr]);
  }

  const failures = [];
  console.log(`\nLighthouse, mobile, median of ${runs} runs (STANDARDS.md §3)\n`);
  for (const route of routes) {
    const lhrs = byRoute.get(route) ?? [];
    if (lhrs.length !== runs) failures.push(`${route}: expected ${runs} runs, found ${lhrs.length}`);
    if (lhrs.length === 0) continue;
    console.log(`Route ${route}  (Lighthouse ${lhrs[0].lighthouseVersion}, ${lhrs[0].configSettings.formFactor})`);

    for (const [id, min] of Object.entries(minScores)) {
      const excluded = id === "seo" && !launched ? [EXPECTED_BEFORE_LAUNCH] : [];
      const perRun = lhrs.map((lhr) =>
        excluded.length ? categoryScoreWithout(lhr, id, excluded) : Math.round(lhr.categories[id].score * 100),
      );
      if (perRun.some((s) => s === null)) {
        failures.push(`${route} ${id}: no score in at least one run`);
        console.log(`  ${id.padEnd(16)} n/a`);
        continue;
      }
      const value = median(perRun);
      const ok = value >= min;
      if (!ok) failures.push(`${route} ${id}: ${value} < ${min}`);
      const note = excluded.length
        ? `  (gate leaves out "${EXPECTED_BEFORE_LAUNCH}"; full Lighthouse SEO score ${median(lhrs.map((l) => Math.round(l.categories.seo.score * 100)))})`
        : "";
      console.log(
        `  ${id.padEnd(16)} ${String(value).padStart(3)}  ≥ ${min}  ${ok ? "ok" : "FAIL"}   runs: ${perRun.join(", ")}${note}`,
      );
    }

    if (!launched) {
      const audit = lhrs[0].audits[EXPECTED_BEFORE_LAUNCH];
      const passed = lhrs.every((l) => l.audits[EXPECTED_BEFORE_LAUNCH].score === 1);
      console.log(
        `  ${EXPECTED_BEFORE_LAUNCH.padEnd(16)} ${passed ? "passed" : "failed"} – expected before launch ` +
          `(SITE_LAUNCHED is false: noindex, nofollow). "${audit.title}"`,
      );
    }
    console.log("");
  }
  console.log(`Reports: ${path.relative(ROOT, REPORTS_DIR)}${path.sep}`);

  for (const f of failures) console.error(`FAIL: ${f}`);
  if (failures.length) process.exit(1);
  console.log("All Lighthouse scores meet their thresholds.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
