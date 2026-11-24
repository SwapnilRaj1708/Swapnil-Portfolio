// Build-time download of font files the build needs but the repository does not hold.
//
// Satoshi (pairing D) is licensed under the ITF Free Font License (FFL) 2.0. The FFL allows
// self-hosting on our own website, but §02 forbids making the font files available through a
// "repository … publicly accessible servers". So the files are never committed: this script
// downloads the official package from Fontshare, checks it, and extracts only the files the site
// needs into src/fonts/vendor/ (git-ignored). next/font/local reads them from there and serves
// them from this site – visitors never contact Fontshare.
//
// Inter Medium as TrueType (SIL OFL, PF-028): the social images (next/og, src/lib/social-image.tsx)
// can only read TTF, OTF or WOFF – not the WOFF2 files next/font uses – so the build downloads
// Inter's TTF from Google Fonts (the host next/font/google already uses at build time). It is only
// read at build time to draw the PNGs; browsers never load it.
//
// Runs before `npm run build` and `npm run dev` (npm `prebuild` / `predev`). Skips the download
// when valid files are already present; `--force` downloads again. Any failure exits with code 1,
// so npm does not start the build – there is no silent fallback.
//
// Pinned file: a file entry with `sha256` must match that hash exactly – both the file already on
// disk (otherwise it is downloaded again) and every fresh download (otherwise the build fails and
// nothing on disk is changed). The site therefore never ships a font release nobody looked at.
// To accept a new release ON PURPOSE: check its licence (FFL.txt in the package) and look at it on
// /dev/type, then replace the `sha256` value below with the hash the failed run printed and run
// `npm run fonts:fetch -- --force`.
//
// Files are extracted byte for byte (no subsetting, renaming of glyph data or format conversion –
// the FFL forbids modifying the font software).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, inflateRawSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = path.join(ROOT, "src", "fonts", "vendor");

const FONTS = [
  {
    name: "Satoshi",
    // Official Fontshare download of the complete family (zip).
    url: "https://api.fontshare.com/v2/fonts/download/satoshi",
    dir: "satoshi",
    files: [
      {
        from: "Satoshi_Complete/Fonts/WEB/fonts/Satoshi-Variable.woff2",
        to: "Satoshi-Variable.woff2",
        woff2: true,
        // Pinned 2026-11-23 (the file the site was designed and reviewed with). See the header.
        sha256: "e739aff9b4d02c264341d6d4872edcda28e79373aeda936f659566a1cd3eb47f",
      },
      { from: "Satoshi_Complete/License/FFL.txt", to: "FFL.txt" },
    ],
  },
  {
    name: "Inter (social images)",
    // Google Fonts' versioned static file for Inter 500 (the CSS API serves TrueType to clients
    // that do not ask for WOFF2). A versioned URL does not change; the pin guards it anyway.
    url: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf",
    dir: "inter",
    // Not a package: the download is the font file itself.
    direct: true,
    files: [
      {
        to: "Inter-Medium.ttf",
        ttf: true,
        // Pinned 2026-11-24 (PF-028). See the header for how to accept a new file on purpose.
        sha256: "8c883f63b2c4157d997319f2c8bc6995ed4357ef371940d31ca159004a4aae63",
      },
    ],
  },
];

const TIMEOUT_MS = 60_000;
const force = process.argv.includes("--force");

class FetchFontsError extends Error {}

function fail(message) {
  throw new FetchFontsError(message);
}

function isWoff2(buf) {
  return buf.length > 1024 && buf.subarray(0, 4).toString("latin1") === "wOF2";
}

/** TrueType outlines start with 0x00010000 (OpenType with TrueType glyphs). */
function isTtf(buf) {
  return buf.length > 1024 && buf.readUInt32BE(0) === 0x00010000;
}

/** The file kind a pinned entry must be, checked before its hash. */
function kindProblem(f, buf) {
  if (f.woff2 && !isWoff2(buf)) return "is not a WOFF2 file";
  if (f.ttf && !isTtf(buf)) return "is not a TrueType file";
  return null;
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function isPresent(font) {
  return font.files.every((f) => {
    const p = path.join(VENDOR, font.dir, f.to);
    if (!existsSync(p)) return false;
    const buf = readFileSync(p);
    if (kindProblem(f, buf)) return false;
    if (f.sha256) {
      const actual = sha256(buf);
      if (actual !== f.sha256) {
        console.log(`[fetch-fonts] ${font.name}: ${f.to} on disk does not match the pinned sha256 – downloading again`);
        return false;
      }
      return true;
    }
    return buf.length > 0;
  });
}

/** Minimal zip reader: returns the named entries' bytes (stored or deflate, CRC-checked). */
function extractFromZip(zip, names) {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file (no end-of-central-directory record)");
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const wanted = new Set(names);
  const out = new Map();
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt zip central directory");
    const method = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    const compSize = zip.readUInt32LE(p + 20);
    const size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted.has(name)) continue;

    if (zip.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`corrupt local header for ${name}`);
    const start = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const raw = zip.subarray(start, start + compSize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`unsupported compression method ${method} for ${name}`);
    if (data.length !== size || crc32(data) >>> 0 !== crc) throw new Error(`checksum mismatch for ${name}`);
    out.set(name, data);
  }
  const missing = names.filter((name) => !out.has(name));
  if (missing.length) throw new Error(`package does not contain: ${missing.join(", ")}`);
  return out;
}

async function fetchFont(font) {
  console.log(`[fetch-fonts] ${font.name}: downloading ${font.url}`);
  let res;
  try {
    res = await fetch(font.url, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    fail(`${font.name}: download from ${font.url} failed (${err?.cause?.message ?? err?.message ?? err})`);
  }
  if (!res.ok) {
    await res.body?.cancel();
    fail(`${font.name}: ${font.url} answered HTTP ${res.status} ${res.statusText}`);
  }
  const download = Buffer.from(await res.arrayBuffer());

  let entries;
  if (font.direct) {
    entries = new Map([[font.files[0].to, download]]);
  } else {
    try {
      entries = extractFromZip(
        download,
        font.files.map((f) => f.from),
      );
    } catch (err) {
      fail(`${font.name}: the downloaded package could not be read (${err?.message ?? err})`);
    }
  }
  const keyOf = (f) => (font.direct ? f.to : f.from);

  // Check every file before writing any, so a rejected download leaves the files on disk unchanged.
  for (const f of font.files) {
    const data = entries.get(keyOf(f));
    const problem = kindProblem(f, data);
    if (problem) fail(`${font.name}: ${keyOf(f)} ${problem}`);
    if (f.sha256) {
      const actual = sha256(data);
      if (actual !== f.sha256) {
        fail(
          [
            `${font.name}: the downloaded ${f.to} does not match the pinned file.`,
            `  pinned   sha256 ${f.sha256}`,
            `  received sha256 ${actual} (${data.length} bytes)`,
            `  ${font.url} is probably serving a new ${font.name} release. Nothing on disk was changed.`,
            `  To accept the new release on purpose: read its licence (for Satoshi FFL.txt in the package), check`,
            `  the font (/dev/type, or the social images), then set sha256 for ${f.to} in scripts/fetch-fonts.mjs to the "received"`,
            `  value above and run \`npm run fonts:fetch -- --force\`.`,
          ].join("\n"),
        );
      }
    }
  }

  const dir = path.join(VENDOR, font.dir);
  mkdirSync(dir, { recursive: true });
  for (const f of font.files) {
    const data = entries.get(keyOf(f));
    const target = path.join(dir, f.to);
    writeFileSync(`${target}.tmp`, data);
    renameSync(`${target}.tmp`, target);
    const pin = f.sha256 ? ", matches pin" : "";
    console.log(`[fetch-fonts] ${font.name}: ${f.to} (${data.length} bytes, sha256 ${sha256(data)}${pin})`);
  }
}

try {
  for (const font of FONTS) {
    if (!force && isPresent(font)) {
      console.log(`[fetch-fonts] ${font.name}: present in src/fonts/vendor/${font.dir} (use --force to download again)`);
      continue;
    }
    await fetchFont(font);
  }
} catch (err) {
  const message = err instanceof FetchFontsError ? err.message : (err?.stack ?? String(err));
  console.error(`\n[fetch-fonts] FAILED: ${message}\n[fetch-fonts] The build cannot continue without these font files.\n`);
  // exitCode instead of process.exit(): lets open sockets close cleanly first.
  process.exitCode = 1;
}
