/**
 * Words of the error pages (src/app/error.tsx, src/app/global-error.tsx). Interface words only.
 *
 * In a file of its own because error boundaries are client components and may not import the
 * validated content (`@/content` pulls zod into the browser bundle): they import this plain object
 * directly. ui.ts includes it as `ui.error`, so the build checks every value like the other labels.
 */
export const errorCopy = {
  code: "Error",
  heading: "Something went wrong",
  body: "This page could not be shown. Try again, or go on to another page.",
  retry: "Try again",
  home: "Home",
  work: "Work",
  resume: "Resume",
} as const;
