import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseColorTokens } from "@/lib/design-tokens";
import { PALETTE } from "./palette";

describe("palette mirror", () => {
  it("equals the colour tokens in globals.css (the one source)", () => {
    const tokens = parseColorTokens(readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8"));
    for (const [name, hex] of Object.entries(PALETTE)) expect(tokens[name], name).toBe(hex);
  });
});
