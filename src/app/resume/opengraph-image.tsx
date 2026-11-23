import { site } from "@/content";
import { renderSocialImage, SOCIAL_ALT, SOCIAL_CONTENT_TYPE, SOCIAL_SIZE } from "@/lib/social-image";

// Social image of /resume (PF-028, src/lib/social-image.tsx). Drawn once at build time.
export const alt = SOCIAL_ALT;
export const size = SOCIAL_SIZE;
export const contentType = SOCIAL_CONTENT_TYPE;

export default function Image() {
  return renderSocialImage(site.meta.resume.title);
}
