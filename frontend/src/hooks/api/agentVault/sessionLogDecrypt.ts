import { z } from "zod";

import {
  TAgentVaultDecryptedChunk,
  TAgentVaultDecryptedSessionLogPage,
  TAgentVaultSessionLogChunk,
  TAgentVaultSessionLogGapReason,
  TAgentVaultSessionLogPage,
  TAgentVaultSessionLogRecord
} from "./types";

const CHUNK_DOWNLOAD_TIMEOUT_MS = 60_000;

// A chunk is listed as soon as its proxy registers it, before the upload lands, and the tail rereads
// chunks this recent, so a 404 inside this window is an upload still in flight.
const CHUNK_UPLOAD_GRACE_MS = 2 * 60_000;

const AAD_VERSION = "v1";

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

// Must byte-match the AAD the Go proxy seals each chunk with.
const buildAad = async (sessionId: string, chunkId: string) =>
  crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${sessionId}|${chunkId}|${AAD_VERSION}`)
  );

const SessionLogRecordsSchema = z.array(
  z.object({
    ts: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
    seq: z.number().int().nonnegative(),
    proxyId: z.string(),
    method: z.string(),
    host: z.string(),
    port: z.string(),
    path: z.string(),
    status: z.number().int(),
    decision: z.string(),
    service: z.string().nullable(),
    accessBundle: z.string().nullable()
  })
);

export const parseSessionLogRecords = (json: unknown): TAgentVaultSessionLogRecord[] | null => {
  const parsed = SessionLogRecordsSchema.safeParse(json);
  return parsed.success ? (parsed.data as TAgentVaultSessionLogRecord[]) : null;
};

export const recordsMatchChunk = (
  records: TAgentVaultSessionLogRecord[],
  chunk: Pick<TAgentVaultSessionLogChunk, "proxyId" | "recordCount" | "firstSeq" | "lastSeq">
) =>
  records.length === chunk.recordCount &&
  records.every(
    (record) =>
      record.proxyId === chunk.proxyId &&
      record.seq >= chunk.firstSeq &&
      record.seq <= chunk.lastSeq
  );

const gapFor = (
  chunk: TAgentVaultSessionLogChunk,
  reason: TAgentVaultSessionLogGapReason
): TAgentVaultDecryptedChunk => ({
  records: [],
  gap: {
    chunkId: chunk.chunkId,
    proxyId: chunk.proxyId,
    proxyName: chunk.proxyName,
    startedAt: chunk.startedAt,
    reason,
    recordCount: chunk.recordCount
  },
  arrivedAt: null
});

const isRetryableSessionLogGap = (reason?: TAgentVaultSessionLogGapReason) =>
  reason === "fetch" || reason === "missing" || reason === "refused";

export const isRetryableResult = (result: TAgentVaultDecryptedChunk) =>
  Boolean(result.isUploading) || isRetryableSessionLogGap(result.gap?.reason);

const withTimeout = (signal: AbortSignal | undefined, ms: number) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, ms);
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  };
};

const openChunk = async (
  chunk: TAgentVaultSessionLogChunk,
  key: CryptoKey,
  sessionId: string,
  signal?: AbortSignal
): Promise<TAgentVaultDecryptedChunk> => {
  if (!chunk.presignedGetUrl) return gapFor(chunk, "repointed");

  const download = withTimeout(signal, CHUNK_DOWNLOAD_TIMEOUT_MS);
  let body: ArrayBuffer;
  try {
    const res = await fetch(chunk.presignedGetUrl, {
      credentials: "omit",
      signal: download.signal
    });
    if (res.status === 404 && Date.now() - Date.parse(chunk.createdAt) < CHUNK_UPLOAD_GRACE_MS) {
      return { records: [], gap: null, arrivedAt: null, isUploading: true };
    }
    if (!res.ok) return gapFor(chunk, res.status === 404 ? "missing" : "refused");
    body = await res.arrayBuffer();
  } catch (error) {
    if (signal?.aborted) throw error;
    return gapFor(chunk, "fetch");
  } finally {
    download.clear();
  }

  if (body.byteLength !== chunk.ciphertextBytes) return gapFor(chunk, "size");

  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", body));
  const expected = base64ToBytes(chunk.ciphertextSha256);
  if (digest.length !== expected.length || digest.some((byte, i) => byte !== expected[i])) {
    return gapFor(chunk, "altered");
  }

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(chunk.iv),
        additionalData: await buildAad(sessionId, chunk.chunkId)
      },
      key,
      body
    );
  } catch {
    return gapFor(chunk, "gcm");
  }

  try {
    const records = parseSessionLogRecords(JSON.parse(new TextDecoder().decode(plaintext)));
    if (!records) return gapFor(chunk, "json");
    if (!recordsMatchChunk(records, chunk)) return gapFor(chunk, "mismatch");
    return {
      records,
      gap: null,
      arrivedAt: null
    };
  } catch {
    return gapFor(chunk, "json");
  }
};

export const createSessionLogChunkCache = (sessionId: string) => {
  let isSettled = false;
  return {
    sessionId,
    keys: new Map<string, Promise<CryptoKey>>(),
    chunks: new Map<string, TAgentVaultDecryptedChunk>(),
    isSettled: () => isSettled,
    settle: () => {
      isSettled = true;
    }
  };
};

export type TAgentVaultSessionLogChunkCache = ReturnType<typeof createSessionLogChunkCache>;

export const decryptSessionLogPage = async <P extends TAgentVaultSessionLogPage>(
  page: P,
  cache: TAgentVaultSessionLogChunkCache,
  signal?: AbortSignal
): Promise<TAgentVaultDecryptedSessionLogPage<P>> => {
  const decrypted: Record<string, TAgentVaultDecryptedChunk> = {};
  const { sessionKey } = page.sessionLogs;
  if (!sessionKey || !page.chunks.length) {
    // Rows that could not be opened have not been shown, so the load that finally opens them is the first one.
    if (!page.sessionLogs.storageUnavailable) cache.settle();
    return { ...page, decrypted };
  }

  let keyPromise = cache.keys.get(sessionKey);
  if (!keyPromise) {
    keyPromise = (async () =>
      crypto.subtle.importKey("raw", base64ToBytes(sessionKey), "AES-GCM", false, ["decrypt"]))();
    cache.keys.set(sessionKey, keyPromise);
  }
  const key = await keyPromise.catch(() => null);
  const opened: string[] = [];

  await Promise.all(
    page.chunks.map(async (chunk) => {
      const known = cache.chunks.get(chunk.chunkId);
      if (known) {
        decrypted[chunk.chunkId] = known;
        return;
      }
      const result = key
        ? await openChunk(chunk, key, cache.sessionId, signal)
        : gapFor(chunk, "gcm");
      // Failed downloads stay uncached so the next fetch retries with a freshly presigned URL.
      if (!isRetryableResult(result)) cache.chunks.set(chunk.chunkId, result);
      decrypted[chunk.chunkId] = result;
      opened.push(chunk.chunkId);
    })
  );

  if (cache.isSettled()) {
    const arrivedAt = Date.now();
    opened.forEach((chunkId) => {
      const stamped = { ...decrypted[chunkId], arrivedAt };
      decrypted[chunkId] = stamped;
      if (cache.chunks.has(chunkId)) cache.chunks.set(chunkId, stamped);
    });
  }
  cache.settle();

  return { ...page, decrypted };
};

export const mergeSessionLogPages = <P extends TAgentVaultSessionLogPage>(
  previous: TAgentVaultDecryptedSessionLogPage<P> | undefined,
  page: TAgentVaultDecryptedSessionLogPage<P>
): TAgentVaultDecryptedSessionLogPage<P> => {
  if (!previous) return page;
  const reread = new Set(page.chunks.map((chunk) => chunk.chunkId));
  return {
    ...page,
    chunks: [...previous.chunks.filter((chunk) => !reread.has(chunk.chunkId)), ...page.chunks],
    decrypted: { ...previous.decrypted, ...page.decrypted }
  };
};
