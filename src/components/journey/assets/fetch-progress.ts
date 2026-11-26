/**
 * Fetches a file and reports every chunk of it as it arrives (the loading-progress signal counts
 * real streamed bytes, not a guess). `total` is the expected size (the manifest's); the buffer
 * grows if more arrives. Cancelled through `signal`.
 */
export async function fetchWithProgress(
  url: string,
  options: { total: number; signal?: AbortSignal; onBytes: (bytes: number) => void; fetchImpl?: typeof fetch },
): Promise<ArrayBuffer> {
  const response = await (options.fetchImpl ?? fetch)(url, { signal: options.signal });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  if (!response.body) {
    const whole = await response.arrayBuffer();
    options.onBytes(whole.byteLength);
    return whole;
  }
  const reader = response.body.getReader();
  let buffer = new Uint8Array(Math.max(0, options.total));
  let offset = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (offset + value.byteLength > buffer.byteLength) {
      const grown = new Uint8Array(Math.max(buffer.byteLength * 2, offset + value.byteLength));
      grown.set(buffer.subarray(0, offset));
      buffer = grown;
    }
    buffer.set(value, offset);
    offset += value.byteLength;
    options.onBytes(value.byteLength);
  }
  return offset === buffer.byteLength ? buffer.buffer : buffer.slice(0, offset).buffer;
}
