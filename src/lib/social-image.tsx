import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { identity, socialImage } from "@/content";
import { PALETTE } from "@/styles/palette";
import { SOCIAL_LAYOUT, scrimGradientLiteral } from "@/styles/stills";

/**
 * Social images (PF-028): 1200 × 630 PNGs drawn at build time by next/og (the installed Next.js's
 * `opengraph-image` file convention, docs/01-app/03-api-reference/03-file-conventions/01-metadata/
 * opengraph-image.md). The still-social render as the background, and from the content data the
 * page's label (none on the home page), the name and the role, in the render's calm left half
 * (SOCIAL_LAYOUT in src/styles/stills.ts; contrast checked by still-contrast.test.ts).
 *
 * Font: Inter Medium. The heading face Satoshi is downloaded at build only as WOFF2, which next/og
 * cannot read (it takes TTF, OTF or WOFF), so scripts/fetch-fonts.mjs fetches Inter as TTF.
 *
 * The font and the background are read once when the module loads, as the installed docs advise
 * ("read it once at module scope"): with Cache Components, a read inside the handler counts as
 * uncached I/O during prerendering and can turn the image route dynamic – it would then run on the
 * server at request time, where the build-time font file does not exist.
 */
export const SOCIAL_SIZE = { width: 1200, height: 630 } as const;
export const SOCIAL_CONTENT_TYPE = "image/png";
/** Alt text of every social image, from the content data. */
export const SOCIAL_ALT = `${identity.name}, ${identity.role}`;

const [font, backgroundJpeg] = await Promise.all([
  readFile(path.join(process.cwd(), "src", "fonts", "vendor", "inter", "Inter-Medium.ttf")),
  readFile(path.join(process.cwd(), "public", socialImage.src)),
]);
const background = `data:image/jpeg;base64,${backgroundJpeg.toString("base64")}`;

/** The social image for a page; `label` names the page (e.g. "Work", "Resume"). */
export function renderSocialImage(label?: string): ImageResponse {
  const scrim = SOCIAL_LAYOUT.scrims.map((s) => scrimGradientLiteral(s, PALETTE.background)).join(", ");
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", backgroundColor: PALETTE.background, fontFamily: "Inter" }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- next/og draws <img>; the PNG's alt is SOCIAL_ALT */}
        <img src={background} width={SOCIAL_SIZE.width} height={SOCIAL_SIZE.height} style={{ position: "absolute", top: 0, left: 0 }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundImage: scrim }} />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            // The text-safe half of the image, less the margins.
            width: SOCIAL_SIZE.width * SOCIAL_LAYOUT.textArea.x1,
            height: "100%",
            padding: "0 0 0 80px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          {label ? (
            <div style={{ display: "flex", color: PALETTE["accent-trace"], fontSize: 26, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 28 }}>
              {label}
            </div>
          ) : null}
          <div style={{ display: "flex", color: PALETTE.text, fontSize: 84, lineHeight: 1, letterSpacing: "-0.02em" }}>{identity.name}</div>
          <div style={{ display: "flex", color: PALETTE["text-muted"], fontSize: 34, marginTop: 24 }}>{identity.role}</div>
        </div>
      </div>
    ),
    {
      ...SOCIAL_SIZE,
      fonts: [{ name: "Inter", data: font, weight: 500, style: "normal" }],
    },
  );
}
