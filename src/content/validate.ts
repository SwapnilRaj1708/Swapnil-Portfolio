import { z } from "zod";
import { contentSchema, uiSchema, type Content } from "./schema";

/** Thrown when the content data does not match the schema; the message lists every problem. */
export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentError";
  }
}

/**
 * Parses the content data against the schema. On failure it throws a ContentError whose message
 * names each field (e.g. `→ at projects[2].stack`) and what is wrong with it, so a broken edit
 * stops the build with a readable message.
 */
export function parseContent(input: unknown): Content {
  const result = contentSchema.safeParse(input);
  if (!result.success) {
    throw new ContentError(
      `Invalid content (src/content/data/):\n${z.prettifyError(result.error)}\n` +
        "Fix the data file(s) above – see docs/content.md for every field.",
    );
  }
  return result.data;
}

/** Checks that every interface label is non-empty; returns the input unchanged (keeps its type). */
export function parseUi<T extends Record<string, Record<string, string>>>(input: T): T {
  const result = uiSchema.safeParse(input);
  if (!result.success) {
    throw new ContentError(`Invalid interface labels (src/content/data/ui.ts):\n${z.prettifyError(result.error)}`);
  }
  return input;
}
