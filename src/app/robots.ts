import type { MetadataRoute } from "next";
import { SITE_LAUNCHED } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: SITE_LAUNCHED
      ? { userAgent: "*", allow: "/" }
      : { userAgent: "*", disallow: "/" },
  };
}
