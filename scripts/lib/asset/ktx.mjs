// The KTX-Software command-line tool (`ktx`, D-43: stable v4.4.2, Apache-2.0, a machine install on
// PATH – not an npm package). The pipeline calls `ktx create` to encode KTX2 textures and
// `ktx extract` to decode them for the review comparison. Arguments are passed as an array (no
// shell), so paths with spaces are safe.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { KTX_MIN_VERSION } from "./settings.mjs";

const run = promisify(execFile);

/** The binary: $KTX_BIN, else `ktx` from PATH. */
export function ktxBinary() {
  return process.env.KTX_BIN || "ktx";
}

/**
 * Parses `ktx --version` output ("ktx version: v4.4.2") and checks it: a stable release (no
 * pre-release suffix such as -rc2) at or above KTX_MIN_VERSION. Returns { version } or { error }.
 */
export function checkKtxVersion(output) {
  const m = /ktx version:\s*v?(\d+)\.(\d+)\.(\d+)(\S*)/i.exec(output);
  if (!m) return { error: `could not read the ktx version from: ${output.trim() || "(no output)"}` };
  const version = `v${m[1]}.${m[2]}.${m[3]}${m[4]}`;
  if (m[4]) return { error: `ktx ${version} is a pre-release; the pipeline uses stable releases only (D-43: v4.4.2)` };
  const parts = [Number(m[1]), Number(m[2]), Number(m[3])];
  for (let i = 0; i < 3; i++) {
    if (parts[i] > KTX_MIN_VERSION[i]) break;
    if (parts[i] < KTX_MIN_VERSION[i]) return { error: `ktx ${version} is older than v${KTX_MIN_VERSION.join(".")} (D-43: install KTX-Software v4.4.2)` };
  }
  return { version };
}

/** Finds the tool and checks its version; throws a clear error if it is missing or unsuitable. */
export async function findKtx(bin = ktxBinary()) {
  let output;
  try {
    const { stdout, stderr } = await run(bin, ["--version"], { windowsHide: true });
    output = `${stdout}${stderr}`;
  } catch (error) {
    const code = /** @type {{ code?: string }} */ (error).code;
    throw new Error(
      code === "ENOENT"
        ? `the KTX tool "${bin}" was not found. Install KTX-Software v4.4.2 (stable, D-43) so that \`ktx\` is on PATH ` +
            "(open a new terminal after installing), or set KTX_BIN to the ktx executable."
        : `"${bin} --version" failed: ${/** @type {Error} */ (error).message}`,
    );
  }
  const checked = checkKtxVersion(output);
  if (checked.error) throw new Error(checked.error);
  return { bin, version: /** @type {string} */ (checked.version) };
}

/** Runs one ktx command; returns stdout. Throws with ktx's own message on failure. */
export async function runKtx(bin, args) {
  try {
    const { stdout } = await run(bin, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    const e = /** @type {Error & { stderr?: string, stdout?: string }} */ (error);
    throw new Error(`ktx ${args[0]} failed: ${(e.stderr || e.stdout || e.message).trim()}`);
  }
}

/**
 * Level 0's quality from `--compare-ssim --compare-psnr` output: the lowest per-channel SSIM, each
 * channel's SSIM, and the PSNR (dB).
 */
export function parseCompare(stdout) {
  const level0 = /Level 0:\s*\n\s*SSIM ([^\n]+)\n\s*PSNR:\s*([\d.]+)/.exec(stdout);
  if (!level0) return null;
  const channels = [...level0[1].matchAll(/([RGBA]):\s*\+?([\d.]+)/g)].map((m) => Number(m[2]));
  if (!channels.length) return null;
  return { ssim: Math.min(...channels), ssimChannels: channels, psnr: Number(level0[2]) };
}
