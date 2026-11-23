export const MAIN_ID = "main";

/** First focusable element on every page: jumps past the header to the main content. */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_ID}`}
      className="label-mono sr-only z-50 rounded-xs border border-accent-signal bg-surface-raised px-4 py-3 text-text focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      Skip to content
    </a>
  );
}
