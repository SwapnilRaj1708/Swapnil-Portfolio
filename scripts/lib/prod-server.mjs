// Starts and stops a local production server (`next start`) for the check scripts.
// Requires an existing production build in `.next/` (run `npm run build` first).

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");

/** Asks the OS for a free TCP port on localhost. */
export function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
      server.close(() => resolve(port));
    });
  });
}

/** Throws with a clear message when there is no production build to serve. */
export function assertBuildExists() {
  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    throw new Error("No production build in .next/ – run `npm run build` first.");
  }
}

/**
 * Starts `next start` on a free port and waits until it answers.
 * @returns {Promise<{ origin: string, port: number, stop: () => Promise<void> }>}
 */
export async function startProdServer() {
  assertBuildExists();
  const port = await findFreePort();
  const origin = `http://localhost:${port}`;
  const child = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port)], {
    cwd: ROOT,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));

  let exited = false;
  child.on("exit", () => (exited = true));

  const stop = async () => {
    if (exited) return;
    const done = new Promise((resolve) => child.once("exit", resolve));
    if (process.platform === "win32") {
      // Kill the whole tree; a plain kill can leave child processes behind on Windows.
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
    await done;
  };

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (exited) throw new Error(`next start exited early:\n${output}`);
    try {
      const res = await fetch(origin, { redirect: "manual" });
      await res.arrayBuffer();
      return { origin, port, stop };
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  await stop();
  throw new Error(`next start did not answer on ${origin} within 60 s:\n${output}`);
}
