"use client";

import { ErrorPanel } from "@/components/layout/error-panel";

/**
 * Error page for a failure inside a page (Next's error boundary for the root segment). It renders
 * inside the root layout, so the site shell – header, navigation, footer – stays. The error itself
 * is never shown: in production Next passes only a generic message and a digest for the server
 * log; neither appears here.
 */
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return <ErrorPanel onRetry={retry} />;
}
