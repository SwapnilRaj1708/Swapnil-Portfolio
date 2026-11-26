// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fetchWithProgress } from "./fetch-progress";
import { chunkedResponse } from "./test-helpers";

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 251).buffer;

describe("fetchWithProgress", () => {
  it("reports every chunk and returns the whole file", async () => {
    const data = bytes(10_000);
    const seen: number[] = [];
    const out = await fetchWithProgress("/x", { total: 10_000, onBytes: (n) => seen.push(n), fetchImpl: (async () => chunkedResponse(data, 3000)) as unknown as typeof fetch });
    expect(seen).toEqual([3000, 3000, 3000, 1000]);
    expect(new Uint8Array(out)).toEqual(new Uint8Array(data));
  });

  it("grows past a wrong total and trims to what arrived", async () => {
    const data = bytes(5000);
    const big = await fetchWithProgress("/x", { total: 100, onBytes: () => {}, fetchImpl: (async () => chunkedResponse(data, 700)) as unknown as typeof fetch });
    expect(big.byteLength).toBe(5000);
    const small = await fetchWithProgress("/x", { total: 9000, onBytes: () => {}, fetchImpl: (async () => chunkedResponse(data, 700)) as unknown as typeof fetch });
    expect(small.byteLength).toBe(5000);
    expect(new Uint8Array(small)).toEqual(new Uint8Array(data));
  });

  it("throws on an HTTP error", async () => {
    await expect(fetchWithProgress("/missing", { total: 1, onBytes: () => {}, fetchImpl: (async () => new Response("", { status: 404 })) as unknown as typeof fetch })).rejects.toThrow(
      "/missing: HTTP 404",
    );
  });
});
