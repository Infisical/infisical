// Web Crypto AES-GCM playback decrypt for PAM session recordings
//
// Each chunk is encrypted with the per-session key under
//   chunkAad = SHA-256( "{projectId}|{sessionId}|{chunkIndex}|{storageBackend}|v1" )
// Cross-position or cross-session swaps fail the GCM tag check before we render anything
//
// Verification chain:
//   1. body length matches chunk.ciphertextBytes
//   2. SHA-256(body) matches chunk.ciphertextSha256 (catches unauthenticated tampering early)
//   3. AES-GCM decrypt under chunkAad -- final integrity gate
//
// Any failure renders a placeholder for that chunk in the player UI

import { TPamPlaybackChunk, TPamRecordingStorageBackend } from "./types";

const PAM_RECORDING_AAD_VERSION = "v1";

export const PAM_PLAYBACK_MAX_CHUNK_BYTES = 256 * 1024 * 1024;
export const PAM_PLAYBACK_MAX_EVENTS_PER_CHUNK = 50_000;
export const PAM_PLAYBACK_MAX_CHUNKS = 10_000;
export const PAM_PLAYBACK_MAX_TOTAL_EVENTS = 500_000;

const base64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
};

export type ChunkAadInput = {
  projectId: string;
  sessionId: string;
  chunkIndex: number;
  storageBackend: TPamRecordingStorageBackend;
};

export const buildChunkAad = async ({
  projectId,
  sessionId,
  chunkIndex,
  storageBackend
}: ChunkAadInput): Promise<Uint8Array> => {
  const enc = new TextEncoder();
  const material = enc.encode(
    `${projectId}|${sessionId}|${chunkIndex}|${storageBackend}|${PAM_RECORDING_AAD_VERSION}`
  );
  const digest = await crypto.subtle.digest("SHA-256", material);
  return new Uint8Array(digest);
};

const importSessionKey = (rawKey: Uint8Array): Promise<CryptoKey> =>
  crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);

export type DecryptedChunkResult =
  | { ok: true; chunkIndex: number; plaintext: Uint8Array; events: unknown[] }
  | {
      ok: false;
      chunkIndex: number;
      reason: "size" | "sha256" | "gcm" | "fetch" | "json";
      message: string;
    };

const fetchCiphertext = async (
  chunk: TPamPlaybackChunk,
  fallbackUrlBuilder: (chunkIndex: number) => string
): Promise<Uint8Array> => {
  const isExternal = Boolean(chunk.presignedGetUrl);
  const url = chunk.presignedGetUrl ?? fallbackUrlBuilder(chunk.chunkIndex);
  const resp = await fetch(url, { credentials: isExternal ? "omit" : "include" });
  if (!resp.ok) {
    if (isExternal && resp.status === 404) {
      throw new Error("Chunk data was not found in the external storage bucket.");
    }
    if (isExternal && resp.status === 403) {
      throw new Error("Access denied when fetching chunk from external storage bucket.");
    }
    throw new Error(
      isExternal
        ? `Failed to fetch chunk from external storage bucket (HTTP ${resp.status})`
        : `Failed to fetch chunk from server (HTTP ${resp.status})`
    );
  }
  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
};

export type DecryptChunkInput = {
  chunk: TPamPlaybackChunk;
  sessionKey: CryptoKey;
  projectId: string;
  sessionId: string;
  fallbackUrlBuilder: (chunkIndex: number) => string;
};

export const decryptOneChunk = async ({
  chunk,
  sessionKey,
  projectId,
  sessionId,
  fallbackUrlBuilder
}: DecryptChunkInput): Promise<DecryptedChunkResult> => {
  if (chunk.ciphertextBytes > PAM_PLAYBACK_MAX_CHUNK_BYTES) {
    return {
      ok: false,
      chunkIndex: chunk.chunkIndex,
      reason: "size",
      message: `declared ciphertextBytes ${chunk.ciphertextBytes} exceeds limit ${PAM_PLAYBACK_MAX_CHUNK_BYTES}`
    };
  }

  let body: Uint8Array;
  try {
    body = await fetchCiphertext(chunk, fallbackUrlBuilder);
  } catch (err) {
    return {
      ok: false,
      chunkIndex: chunk.chunkIndex,
      reason: "fetch",
      message: (err as Error)?.message ?? "fetch failed"
    };
  }

  if (body.length !== chunk.ciphertextBytes) {
    return {
      ok: false,
      chunkIndex: chunk.chunkIndex,
      reason: "size",
      message: `body length ${body.length} does not match declared ${chunk.ciphertextBytes}`
    };
  }

  let expectedSha: Uint8Array;
  try {
    expectedSha = base64ToBytes(chunk.ciphertextSha256);
  } catch {
    return {
      ok: false,
      chunkIndex: chunk.chunkIndex,
      reason: "sha256",
      message: "invalid base64 in ciphertextSha256"
    };
  }

  const actualShaBuf = await crypto.subtle.digest("SHA-256", body);
  const actualSha = new Uint8Array(actualShaBuf);
  if (!timingSafeEqual(expectedSha, actualSha)) {
    return {
      ok: false,
      chunkIndex: chunk.chunkIndex,
      reason: "sha256",
      message: `sha256 mismatch (expected ${bytesToHex(expectedSha).slice(0, 16)}…, got ${bytesToHex(actualSha).slice(0, 16)}…)`
    };
  }

  let iv: Uint8Array;
  try {
    iv = base64ToBytes(chunk.iv);
  } catch {
    return {
      ok: false,
      chunkIndex: chunk.chunkIndex,
      reason: "gcm",
      message: "invalid base64 in iv"
    };
  }
  const aad = await buildChunkAad({
    projectId,
    sessionId,
    chunkIndex: chunk.chunkIndex,
    storageBackend: chunk.storageBackend
  });

  let plaintextBuf: ArrayBuffer;
  try {
    plaintextBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      sessionKey,
      body
    );
  } catch (err) {
    return {
      ok: false,
      chunkIndex: chunk.chunkIndex,
      reason: "gcm",
      message: (err as Error)?.message ?? "AES-GCM decrypt failed"
    };
  }

  const plaintext = new Uint8Array(plaintextBuf);
  let events: unknown[];
  try {
    const decoder = new TextDecoder();
    const parsed = JSON.parse(decoder.decode(plaintext));
    if (!Array.isArray(parsed)) {
      return {
        ok: false,
        chunkIndex: chunk.chunkIndex,
        reason: "json",
        message: "plaintext is not a JSON array"
      };
    }
    if (parsed.length > PAM_PLAYBACK_MAX_EVENTS_PER_CHUNK) {
      return {
        ok: false,
        chunkIndex: chunk.chunkIndex,
        reason: "json",
        message: `chunk contains ${parsed.length} events, exceeds limit ${PAM_PLAYBACK_MAX_EVENTS_PER_CHUNK}`
      };
    }
    events = parsed;
  } catch (err) {
    return {
      ok: false,
      chunkIndex: chunk.chunkIndex,
      reason: "json",
      message: (err as Error)?.message ?? "plaintext is not valid JSON"
    };
  }

  return { ok: true, chunkIndex: chunk.chunkIndex, plaintext, events };
};

export const importSessionKeyFromBase64 = async (b64: string): Promise<CryptoKey> => {
  const raw = base64ToBytes(b64);
  if (raw.length !== 32) throw new Error(`expected 32-byte session key, got ${raw.length}`);
  return importSessionKey(raw);
};

// detectChunkGaps walks the chunkIndex sequence and returns the indices of any missing chunks
export const detectChunkGaps = (chunks: TPamPlaybackChunk[]): number[] => {
  const present = new Set(chunks.map((c) => c.chunkIndex));
  if (present.size === 0) return [];
  let max = 0;
  present.forEach((idx) => {
    if (idx > max) max = idx;
  });
  const gaps: number[] = [];
  for (let i = 0; i <= max; i += 1) {
    if (!present.has(i)) gaps.push(i);
  }
  return gaps;
};
