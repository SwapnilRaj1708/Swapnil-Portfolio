import { renderSocialImage, SOCIAL_ALT, SOCIAL_CONTENT_TYPE, SOCIAL_SIZE } from "@/lib/social-image";

// Social image of the home page (and of every page without its own): name and role over the
// still-social render (PF-028, src/lib/social-image.tsx). Drawn once at build time.
export const alt = SOCIAL_ALT;
export const size = SOCIAL_SIZE;
export const contentType = SOCIAL_CONTENT_TYPE;

export default function Image() {
  return renderSocialImage();
}
