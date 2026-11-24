import { clsx } from "clsx";
import { getImageProps } from "next/image";
import type { Still } from "@/content";

export type StillPictureProps = {
  still: Still;
  /** Media query that selects the wide crop; every other screen gets the portrait crop. */
  wideMedia: string;
  /** How wide the image is drawn (the stills are full-bleed). */
  sizes?: string;
  /** The hero still is the page's largest paint: fetch it at once, at high priority. */
  eager?: boolean;
  className?: string;
};

/**
 * A still in both crops, art-directed with `<picture>` (the installed Next.js's documented way:
 * `getImageProps` for each crop, docs/01-app/03-api-reference/02-components/image.md "Art
 * direction"). next/image resizes and re-encodes each crop for the device (AVIF, else WebP).
 *
 * Decorative (`alt=""`): the stills stand in for the 3D scene, which is hidden from assistive
 * technology. The caller sizes and positions the image (it covers its box).
 *
 * Images off or failed: a sized image that fails still gets a broken-image frame and icon in
 * Chromium, even with an empty alt. Browsers generate an image's `::after` only when it failed (a
 * loaded image is replaced content and has none), so an `::after` panel in the background colour
 * covers the frame: a failed still shows the background colour and nothing else.
 */
export function StillPicture({ still, wideMedia, sizes = "100vw", eager = false, className }: StillPictureProps) {
  const common = { alt: "", sizes };
  const {
    props: { srcSet: wideSrcSet },
  } = getImageProps({ ...common, src: still.wide.src, width: still.wide.width, height: still.wide.height });
  const { props: portrait } = getImageProps({
    ...common,
    src: still.portrait.src,
    width: still.portrait.width,
    height: still.portrait.height,
    loading: eager ? "eager" : "lazy",
    fetchPriority: eager ? "high" : undefined,
  });

  return (
    <picture>
      <source media={wideMedia} srcSet={wideSrcSet} sizes={sizes} width={still.wide.width} height={still.wide.height} />
      <img
        {...portrait}
        alt=""
        className={clsx("after:absolute after:inset-0 after:bg-background after:content-['']", className)}
      />
    </picture>
  );
}
