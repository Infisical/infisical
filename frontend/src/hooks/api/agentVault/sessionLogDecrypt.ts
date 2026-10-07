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

// The server refuses to sign an upload over this, so anything larger in the bucket is not a chunk.
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
const IV_BYTES = 12;
const TAG_BYTES = 16;

// The live tail hands a chunk over as soon as its proxy asks for an upload link, before the upload lands, so a
// tail chunk that isn't in the bucket yet is most likely still uploading rather than gone.
export const SESSION_LOG_UPLOAD_GRACE_MS = 2 * 60_000;

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

// Two proxies can mint the same chunk id, so a chunk is only unique with its proxy.
export const sessionLogChunkKey = (
  chunk: Pick<TAgentVaultSessionLogChunk, "chunkId" | "proxyId">
) => `${chunk.proxyId}/${chunk.chunkId}`;

// The object name carries the proxy Infisical signed the upload for, so every record inside must name it too.
export const recordsMatchChunk = (
  records: TAgentVaultSessionLogRecord[],
  chunk: Pick<TAgentVaultSessionLogChunk, "proxyId">
) => records.every((record) => record.proxyId === chunk.proxyId);

const gapFor = (reason: TAgentVaultSessionLogGapReason): TAgentVaultDecryptedChunk => ({
  records: [],
  gap: { reason, firstSeenAt: null },
  arrivedAt: null
});

class ChunkTooLargeError extends Error {}

// Stops reading past the expected size, so a huge object in the bucket can't freeze the tab.
const readCapped = async (res: Response, limit: number) => {
  if (!res.body) return res.arrayBuffer();
  let total = 0;
  const capped = res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(part, controller) {
        total += part.byteLength;
        if (total > limit) controller.error(new ChunkTooLargeError());
        else controller.enqueue(part);
      }
    })
  );
  return new Response(capped).arrayBuffer();
};

const isRetryableSessionLogGap = (reason?: TAgentVaultSessionLogGapReason) =>
  reason === "fetch" || reason === "missing" || reason === "refused";

export const isRetryableResult = (result: TAgentVaultDecryptedChunk) =>
  isRetryableSessionLogGap(result.gap?.reason);

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
  if (chunk.ciphertextBytes > MAX_CHUNK_BYTES || chunk.ciphertextBytes < IV_BYTES + TAG_BYTES) {
    return gapFor("size");
  }

  const download = withTimeout(signal, CHUNK_DOWNLOAD_TIMEOUT_MS);
  let body: ArrayBuffer;
  try {
    const res = await fetch(chunk.presignedGetUrl, {
      credentials: "omit",
      signal: download.signal
    });
    if (!res.ok) return gapFor(res.status === 404 ? "missing" : "refused");
    body = await readCapped(res, chunk.ciphertextBytes);
  } catch (error) {
    if (error instanceof ChunkTooLargeError) return gapFor("size");
    if (signal?.aborted) throw error;
    return gapFor("fetch");
  } finally {
    download.clear();
  }

  if (body.byteLength !== chunk.ciphertextBytes) return gapFor("size");

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: body.slice(0, IV_BYTES),
        additionalData: await buildAad(sessionId, chunk.chunkId)
      },
      key,
      body.slice(IV_BYTES)
    );
  } catch {
    return gapFor("gcm");
  }

  try {
    const records = parseSessionLogRecords(JSON.parse(new TextDecoder().decode(plaintext)));
    if (!records) return gapFor("json");
    if (!recordsMatchChunk(records, chunk)) return gapFor("mismatch");
    return {
      records,
      gap: null,
      arrivedAt: null
    };
  } catch {
    return gapFor("json");
  }
};

export const createSessionLogChunkCache = (sessionId: string) => {
  let isSettled = false;
  // A tail page with nothing new carries no key, but a retry of an earlier chunk still needs it.
  let sessionKey: string | null = null;
  return {
    sessionId,
    keys: new Map<string, Promise<CryptoKey>>(),
    chunks: new Map<string, TAgentVaultDecryptedChunk>(),
    // When the live tail first handed over each chunk, so one still uploading is given time to land.
    firstSeen: new Map<string, number>(),
    sessionKey: () => sessionKey,
    rememberSessionKey: (key: string) => {
      sessionKey = key;
    },
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
  signal?: AbortSignal,
  { isTail = false }: { isTail?: boolean } = {}
): Promise<TAgentVaultDecryptedSessionLogPage<P>> => {
  const decrypted: Record<string, TAgentVaultDecryptedChunk> = {};
  if (page.sessionLogs.sessionKey) cache.rememberSessionKey(page.sessionLogs.sessionKey);
  const sessionKey = cache.sessionKey();
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
      const chunkKey = sessionLogChunkKey(chunk);
      const known = cache.chunks.get(chunkKey);
      if (known) {
        decrypted[chunkKey] = known;
        return;
      }
      if (isTail && !cache.firstSeen.has(chunkKey)) cache.firstSeen.set(chunkKey, Date.now());
      let result = key ? await openChunk(chunk, key, cache.sessionId, signal) : gapFor("gcm");
      if (result.gap && isTail) {
        result = {
          ...result,
          gap: { ...result.gap, firstSeenAt: cache.firstSeen.get(chunkKey) ?? null }
        };
      }
      // Failed downloads stay uncached so a later read retries them.
      if (!isRetryableResult(result)) cache.chunks.set(chunkKey, result);
      decrypted[chunkKey] = result;
      opened.push(chunkKey);
    })
  );

  if (cache.isSettled()) {
    const arrivedAt = Date.now();
    opened.forEach((chunkKey) => {
      const stamped = { ...decrypted[chunkKey], arrivedAt };
      decrypted[chunkKey] = stamped;
      if (cache.chunks.has(chunkKey)) cache.chunks.set(chunkKey, stamped);
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
  const reread = new Set(page.chunks.map(sessionLogChunkKey));
  return {
    ...page,
    chunks: [
      ...previous.chunks.filter((chunk) => !reread.has(sessionLogChunkKey(chunk))),
      ...page.chunks
    ],
    decrypted: { ...previous.decrypted, ...page.decrypted }
  };
};
