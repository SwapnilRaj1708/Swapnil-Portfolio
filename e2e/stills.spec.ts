import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import { identity, about } from "../src/content/data/identity";
import { homeSections, site } from "../src/content/data/site";
import { stills } from "../src/content/data/stills";
import { STILL_LAYOUT, type Crop } from "../src/styles/stills";
import { expectNoAxeViolations } from "./axe";

// Stage 1 home (PF-028): the stills behind the hero and the section banners, the social images,
// the icons and the manifest.

const CHAPTERS = homeSections.map((s) => s.chapter);

/** Window sizes the text-safe check runs at (desktop project): phones, tablets, laptops, wide. */
const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

/** Scrolls every still into view and waits until each has loaded its current crop. */
async function loadAllStills(page: Page) {
  const count = await page.locator("main section[data-chapter] picture img").count();
  for (let i = 0; i < count; i++) {
    const img = page.locator("main section[data-chapter] picture img").nth(i);
    await img.scrollIntoViewIfNeeded();
    // Generous: the first request for a width and format makes next/image encode it (a 2560 px
    // AVIF takes seconds when every test worker is busy). Loading speed is not what this measures.
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0 && !!el.currentSrc), { timeout: 20_000 })
      .toBe(true);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

type Placement = { chapter: string; crop: Crop; text: { x0: number; x1: number; y0: number; y1: number } };

/**
 * Where the text over each still lands on the image as drawn: the text's own box (a Range over
 * the text, not its block) mapped through object-fit: cover and object-position into fractions of
 * the image.
 */
function placements(page: Page): Promise<Placement[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-over-still]")].map((el) => {
      const section = el.closest("section[data-chapter]")!;
      const img = section.querySelector<HTMLImageElement>("picture img")!;
      const crop = /-(wide|portrait)\.webp/.exec(decodeURIComponent(img.currentSrc))![1] as "wide" | "portrait";
      const box = img.getBoundingClientRect();
      const scale = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      const [px, py] = getComputedStyle(img)
        .objectPosition.split(" ")
        .map((v) => parseFloat(v) / 100);
      const ox = box.left + (box.width - dw) * px;
      const oy = box.top + (box.height - dh) * py;
      // Union of the text's line boxes (a Range over the element itself would also count the
      // full-width boxes of its block children).
      const t = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (r.width === 0 || r.height === 0) continue;
          t.left = Math.min(t.left, r.left);
          t.right = Math.max(t.right, r.right);
          t.top = Math.min(t.top, r.top);
          t.bottom = Math.max(t.bottom, r.bottom);
        }
      }
      return {
        chapter: section.getAttribute("data-chapter")!,
        crop,
        text: { x0: (t.left - ox) / dw, x1: (t.right - ox) / dw, y0: (t.top - oy) / dh, y1: (t.bottom - oy) / dh },
      };
    }),
  );
}

const EPS = 0.002;

async function expectTextInsideSafeAreas(page: Page, label: string) {
  const found = await placements(page);
  expect(found.map((p) => p.chapter)).toEqual(CHAPTERS);
  const f = (n: number) => n.toFixed(2);
  console.log(
    `[safe area] ${test.info().project.name} ${label}: ` +
      found.map((p) => `${p.chapter} ${p.crop} x ${f(p.text.x0)}–${f(p.text.x1)} y ${f(p.text.y0)}–${f(p.text.y1)}`).join(" | "),
  );
  const width = page.viewportSize()!.width;
  const landscape = width > page.viewportSize()!.height;
  for (const p of found) {
    // Art direction: the hero's crop follows the orientation, a banner's the `md` breakpoint.
    const expected: Crop = p.chapter === "port" ? (landscape ? "wide" : "portrait") : width >= 768 ? "wide" : "portrait";
    expect(p.crop, `${label} ${p.chapter}: crop`).toBe(expected);
    const area = STILL_LAYOUT[p.chapter as keyof typeof STILL_LAYOUT][p.crop].textArea;
    const where = `${label} ${p.chapter} ${p.crop}: text ${JSON.stringify(p.text)} inside ${JSON.stringify(area)}`;
    expect(p.text.x0, where).toBeGreaterThanOrEqual(area.x0 - EPS);
    expect(p.text.x1, where).toBeLessThanOrEqual(area.x1 + EPS);
    expect(p.text.y0, where).toBeGreaterThanOrEqual(area.y0 - EPS);
    expect(p.text.y1, where).toBeLessThanOrEqual(area.y1 + EPS);
  }
}

test.describe("text over the stills", () => {
  test("stays inside each still's text-safe area at every window size", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "window sizes are set explicitly; the phone project runs its own below");
    test.setTimeout(120_000);
    for (const vp of VIEWPORTS) {
      await page.setViewportSize(vp);
      await page.goto("/");
      await loadAllStills(page);
      await expectTextInsideSafeAreas(page, `${vp.width}×${vp.height}`);
    }
  });

  test("stays inside each still's text-safe area on the phone", async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "phone project only");
    await page.goto("/");
    await loadAllStills(page);
    await expectTextInsideSafeAreas(page, "phone");
  });
});

test.describe("stills", () => {
  test("the hero still loads at once and at high priority; every banner lazily", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("section#top picture img");
    await expect(hero).toHaveAttribute("loading", "eager");
    await expect(hero).toHaveAttribute("fetchpriority", "high");
    const banners = page.locator("main section[data-chapter]:not(#top) picture img");
    await expect(banners).toHaveCount(stills.length - 1);
    for (const loading of await banners.evaluateAll((els) => els.map((el) => el.getAttribute("loading")))) expect(loading).toBe("lazy");
    // Decorative: empty alt, so assistive technology skips them and a failed image draws nothing.
    for (const alt of await page.locator("main picture img").evaluateAll((els) => els.map((el) => el.getAttribute("alt")))) expect(alt).toBe("");
  });

  test("with images off every section still reads as designed text on the background colour", async ({ page }) => {
    await page.goto("/");
    await loadAllStills(page);
    const withImages = await page.locator("main section[data-chapter]").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));

    await page.route("**/_next/image**", (route) => route.abort());
    await page.goto("/");
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
    });
    // Same layout as with the images: the boxes never depended on them.
    const without = await page.locator("main section[data-chapter]").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    expect(without).toEqual(withImages);
    await expect(page.getByRole("heading", { level: 1, name: identity.name })).toBeVisible();
    await expect(page.getByText(identity.pitch)).toBeVisible();
    for (const s of homeSections.filter((x) => x.chapter !== "port")) {
      await expect(page.getByRole("heading", { level: 2, name: s.heading })).toBeVisible();
    }
    // Every image failed, has an empty alt (nothing is drawn – no broken-image icon), and sits
    // on a box painted in the background colour.
    const stillStates = await page.locator("main picture img").evaluateAll((els) =>
      els.map((el) => {
        const img = el as HTMLImageElement;
        let box: HTMLElement | null = img.parentElement;
        while (box && getComputedStyle(box).backgroundColor === "rgba(0, 0, 0, 0)") box = box.parentElement;
        return { loaded: img.naturalWidth > 0, alt: img.getAttribute("alt"), under: box ? getComputedStyle(box).backgroundColor : null };
      }),
    );
    for (const s of stillStates) expect(s).toEqual({ loaded: false, alt: "", under: "rgb(7, 9, 12)" });
    // What is actually drawn: Chromium gives a failed, sized image a frame and a 16 px broken-image
    // icon in its top-left corner, even with an empty alt. That corner (16 × 24 px, clear of the
    // hero's text, which starts a gutter in) must show only the background.
    const stills = page.locator("main picture img");
    for (let i = 0; i < (await stills.count()); i++) {
      const img = stills.nth(i);
      // Its top-left corner well below the sticky header (the hero's is already, at the page top).
      await img.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 200));
      const box = (await img.boundingBox())!;
      const png = await page.screenshot({ clip: { x: box.x, y: box.y, width: 16, height: 24 } });
      const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let worst = 0;
      for (let p = 0; p < data.length; p += 3) {
        worst = Math.max(worst, Math.abs(data[p] - 7), Math.abs(data[p + 1] - 9), Math.abs(data[p + 2] - 12));
      }
      if (worst > 3) await test.info().attach(`still-${i}-corner.png`, { body: png, contentType: "image/png" });
      expect(worst, `still ${i} at ${JSON.stringify(box)}: the failed image's corner differs from the background by ${worst}`).toBeLessThanOrEqual(3);
    }
    await expectNoAxeViolations(page, "home, images off");
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("the stills load and every section's text is there", async ({ page }) => {
      await page.goto("/");
      const hero = page.locator("section#top picture img");
      await expect.poll(() => hero.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
      const last = page.locator("section#contact picture img");
      await last.scrollIntoViewIfNeeded();
      await expect.poll(() => last.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
      await expect(page.getByRole("heading", { level: 1, name: identity.name })).toBeVisible();
      for (const beat of about.beats) await expect(page.getByText(beat)).toBeVisible();
      for (const s of homeSections.filter((x) => x.chapter !== "port")) {
        await expect(page.getByRole("heading", { level: 2, name: s.heading })).toBeVisible();
      }
    });
  });

  test("the home page has no accessibility violations (axe, WCAG 2.1 AA)", async ({ page }) => {
    await page.goto("/");
    await loadAllStills(page);
    await expectNoAxeViolations(page, "home");
  });
});

/** Width and height from a PNG's IHDR chunk. */
function pngSize(buf: Buffer) {
  expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test.describe("social images", () => {
  // Case studies, the 404 and the contact results carry their section's (or the home page's) image.
  const PAGES: [route: string, image: string, title: string][] = [
    ["/", "/opengraph-image", site.meta.home.title],
    ["/work", "/work/opengraph-image", `${site.meta.work.title} – ${identity.name}`],
    ["/work/twizzr", "/work/opengraph-image", `Twizzr – ${identity.name}`],
    ["/resume", "/resume/opengraph-image", `${site.meta.resume.title} – ${identity.name}`],
    ["/contact/result/sent", "/opengraph-image", `Message sent – ${identity.name}`],
  ];

  for (const [route, image, title] of PAGES) {
    test(`${route} has its title, description and 1200 × 630 image in the Open Graph and Twitter tags`, async ({ page, request }) => {
      await page.goto(route);
      const meta = (selector: string) => page.locator(selector).getAttribute("content");
      expect(await meta('meta[property="og:title"]')).toBe(title);
      expect(await meta('meta[name="twitter:title"]')).toBe(title);
      const description = await meta('meta[name="description"]');
      expect(description).toBeTruthy();
      expect(await meta('meta[property="og:description"]')).toBe(description);
      expect(await meta('meta[name="twitter:description"]')).toBe(description);
      expect(await meta('meta[property="og:type"]')).toBe("website");
      expect(await meta('meta[property="og:site_name"]')).toBe(identity.name);
      expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
      expect(await meta('meta[property="og:image:alt"]')).toBe(`${identity.name}, ${identity.role}`);
      expect(await meta('meta[property="og:image:width"]')).toBe("1200");
      expect(await meta('meta[property="og:image:height"]')).toBe("630");
      const og = new URL((await meta('meta[property="og:image"]'))!);
      const tw = new URL((await meta('meta[name="twitter:image"]'))!);
      expect(og.pathname).toBe(image);
      expect(tw.pathname).toBe(image);
      // The absolute URL's origin is the deployment's (Vercel) or localhost:3000 in a local build;
      // fetch the path from this server.
      const res = await request.get(og.pathname + og.search);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("image/png");
      expect(pngSize(await res.body())).toEqual({ width: 1200, height: 630 });
    });
  }
});

test.describe("icons and manifest", () => {
  test("favicon.ico holds 16, 32 and 48 px images (no more /favicon.ico 404)", async ({ request }) => {
    const res = await request.get("/favicon.ico");
    expect(res.status()).toBe(200);
    const ico = await res.body();
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico.readUInt8(6 + 16 * i) || 256);
    expect(sizes).toEqual([16, 32, 48]);
  });

  test("every page links the favicon, the app icons, the apple-touch icon and the manifest", async ({ page }) => {
    for (const route of ["/", "/work", "/resume"]) {
      await page.goto(route);
      const links = await page.locator('head link[rel="icon"], head link[rel="apple-touch-icon"], head link[rel="manifest"]').evaluateAll((els) =>
        els.map((el) => `${el.getAttribute("rel")} ${new URL((el as HTMLLinkElement).href).pathname} ${el.getAttribute("sizes") ?? ""}`.trim()),
      );
      expect(links).toEqual([
        "manifest /manifest.webmanifest",
        "icon /favicon.ico 48x48",
        "icon /icon1.png 192x192",
        "icon /icon2.png 512x512",
        "apple-touch-icon /apple-icon.png 180x180",
      ]);
    }
  });

  test("the manifest names the site, uses the background colour and lists icons that exist at their sizes", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const manifest = await res.json();
    expect(manifest).toMatchObject({
      name: site.meta.home.title,
      short_name: "Swapnil Raj",
      theme_color: "#07090c",
      background_color: "#07090c",
      start_url: "/",
    });
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(["192x192", "512x512"]);
    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      const file = await request.get(icon.src);
      expect(file.status(), icon.src).toBe(200);
      const { width, height } = pngSize(await file.body());
      expect(`${width}x${height}`).toBe(icon.sizes);
    }
    const apple = await request.get("/apple-icon.png");
    expect(pngSize(await apple.body())).toEqual({ width: 180, height: 180 });
  });
});
