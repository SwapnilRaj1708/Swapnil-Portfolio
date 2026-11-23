import { clsx } from "clsx";
import Image from "next/image";
import type { Media } from "@/content";

export type ProjectImageProps = {
  media: Media;
  /** How wide the image is drawn at each breakpoint (the `sizes` attribute). */
  sizes: string;
  /** Above the fold (case-study header): fetch at high priority instead of lazily. */
  eager?: boolean;
  className?: string;
};

/**
 * A project image through next/image: optimised and resized per device, alt text from the
 * content. Drawn inside a ScreenFrame: it fills the frame's 16:10 screen (cover, anchored at the
 * top, where a homepage's first screen starts). Width and height from the data stay on the
 * element; the frame's fixed aspect ratio reserves the space – no layout shift.
 */
export function ProjectImage({ media, sizes, eager = false, className }: ProjectImageProps) {
  return (
    <Image
      src={media.src}
      alt={media.alt}
      width={media.width}
      height={media.height}
      sizes={sizes}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      className={clsx("block h-full w-full object-cover object-top", className)}
    />
  );
}
