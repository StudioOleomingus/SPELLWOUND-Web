import type { Puzzle } from "./types";

/**
 * Zero-backend sharing: a whole puzzle compressed (gzip) and base64url-
 * encoded, small enough to live in a URL hash fragment (#p=...). A hosted
 * backend with short codes can replace this later without changing callers.
 */

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): Uint8Array {
  const b64 = code.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function encodePuzzle(puzzle: Puzzle): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(puzzle));
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return toBase64Url(compressed);
}

export async function decodePuzzle(code: string): Promise<Puzzle> {
  const compressed = fromBase64Url(code);
  const stream = new Blob([compressed as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const json = await new Response(stream).text();
  return JSON.parse(json) as Puzzle;
}
