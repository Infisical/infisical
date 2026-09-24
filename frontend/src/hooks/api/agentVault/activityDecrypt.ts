import { useMemo } from "react";
import { z } from "zod";

import {
  TAgentVaultActivityChunk,
  TAgentVaultActivityDrop,
  TAgentVaultActivityGap,
  TAgentVaultActivityGapReason,
  TAgentVaultActivityPage,
  TAgentVaultActivityRecord,
  TAgentVaultDecryptedActivityPage,
  TAgentVaultDecryptedChunk
} from "./types";

/**
 * Stop accumulating past this many records across loaded pages. The table is not virtualised, and a
 * viewer who has paged this far is looking for a filter rather than more rows.
 */
export const AGENT_VAULT_ACTIVITY_MAX_RECORDS = 100_000;

/**
 * Stop, too, once this much opened activity is held, however few records it is. Real records are a few
 * hundred bytes, so 100,000 of them come to about 20 MB. This only binds on chunks far heavier than their
 * record count, which the tab would otherwise go on downloading and holding for as long as it was handed.
 * It is checked as pages and polls land rather than before each request, so a live poll that chains reads
 * to catch up on a backlog can carry the tab past it before live updates pause.
 */
export const AGENT_VAULT_ACTIVITY_MAX_LOADED_BYTES = 64 * 1024 * 1024;

/**
 * Chunks are at most 8 MB, so a download still running after this long is hung rather than slow. It is
 * reported as a chunk that could not be read, which the next poll retries with a fresh URL.
 */
const CHUNK_DOWNLOAD_TIMEOUT_MS = 60_000;

const AAD_VERSION = "v1";

/** Stable per record: seq is unique within a proxy, and ts separates two proxies' streams. */
export const activityRecordKey = (record: TAgentVaultActivityRecord) =>
  `${record.proxyId}-${record.seq}-${record.ts}`;

// There are no shared base64 or hex helpers anywhere in lib/ or helpers/, so these two are local.
const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/**
 * The same string the Go proxy hashes and the backend pins a vector for. It binds a chunk to one place
 * in the hierarchy, so holding the session key is not enough to replay a chunk somewhere else.
 */
const buildAad = async (parts: {
  projectId: string;
  sessionId: string;
  proxyId: string;
  chunkId: string;
}) => {
  const source = `${parts.projectId}|${parts.sessionId}|${parts.proxyId}|${parts.chunkId}|${AAD_VERSION}`;
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
};

/**
 * Checked field by field because the timeline calls string methods on these and formats `ts` as a date, so
 * one wrong type from a modified proxy would throw during render and take the whole Sessions page down.
 * `decision` stays a plain string: the table already has a fallback for a value it does not know.
 */
const ActivityRecordsSchema = z.array(
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

export const parseActivityRecords = (json: unknown): TAgentVaultActivityRecord[] | null => {
  const parsed = ActivityRecordsSchema.safeParse(json);
  return parsed.success ? (parsed.data as TAgentVaultActivityRecord[]) : null;
};

/**
 * The chunk's proxy comes from the authenticated caller and is bound into the AAD, while each record's
 * fields are whatever the proxy wrote. A batch whose records disagree with it, claiming another proxy's id,
 * more records than the row counts, or sequence numbers outside its range, can only come from a proxy
 * that lied. Nothing in it can be trusted, so it is shown as a batch that cannot be read rather than
 * relabelled.
 */
export const recordsMatchChunk = (
  records: TAgentVaultActivityRecord[],
  chunk: Pick<TAgentVaultActivityChunk, "proxyId" | "recordCount" | "firstSeq" | "lastSeq">
) =>
  records.length === chunk.recordCount &&
  records.every(
    (record) =>
      record.proxyId === chunk.proxyId &&
      record.seq >= chunk.firstSeq &&
      record.seq <= chunk.lastSeq
  );

const dropFor = (chunk: TAgentVaultActivityChunk): TAgentVaultActivityDrop | null =>
  chunk.droppedCount > 0
    ? {
        chunkId: chunk.chunkId,
        proxyId: chunk.proxyId,
        proxyName: chunk.proxyName,
        startedAt: chunk.startedAt,
        droppedCount: chunk.droppedCount
      }
    : null;

const gapFor = (
  chunk: TAgentVaultActivityChunk,
  reason: TAgentVaultActivityGapReason
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
  // From the index row, so it holds whether or not the chunk itself can be read. The proxy relies on this:
  // once a chunk's row exists, it no longer carries that chunk's drop count forward itself.
  drop: dropFor(chunk),
  arrivedAt: null
});

/** Aborts when the caller's signal does, or after `ms`, whichever comes first. */
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
  chunk: TAgentVaultActivityChunk,
  key: CryptoKey,
  context: { projectId: string; sessionId: string },
  signal?: AbortSignal
): Promise<TAgentVaultDecryptedChunk> => {
  if (!chunk.presignedGetUrl) return gapFor(chunk, "repointed");

  const download = withTimeout(signal, CHUNK_DOWNLOAD_TIMEOUT_MS);
  let body: ArrayBuffer;
  try {
    // credentials omitted: S3 rejects a request that carries cookies against a presigned signature.
    const res = await fetch(chunk.presignedGetUrl, {
      credentials: "omit",
      signal: download.signal
    });
    if (!res.ok) return gapFor(chunk, "fetch");
    body = await res.arrayBuffer();
  } catch (error) {
    // A cancelled query is not a chunk that failed to download. Rethrown so React Query sees the
    // cancellation, rather than a gap that would read as an unreachable bucket.
    if (signal?.aborted) throw error;
    return gapFor(chunk, "fetch");
  } finally {
    download.clear();
  }

  // Checked before the tag so a truncated object is reported as a size problem rather than a bad key.
  if (body.byteLength !== chunk.ciphertextBytes) return gapFor(chunk, "size");

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(chunk.iv),
        additionalData: await buildAad({
          ...context,
          proxyId: chunk.proxyId,
          chunkId: chunk.chunkId
        })
      },
      key,
      body
    );
  } catch {
    // No hash is verified alongside this: the GCM tag already authenticates the bytes, and checking a
    // digest the same server handed us would add nothing.
    return gapFor(chunk, "gcm");
  }

  try {
    const records = parseActivityRecords(JSON.parse(new TextDecoder().decode(plaintext)));
    if (!records) return gapFor(chunk, "json");
    if (!recordsMatchChunk(records, chunk)) return gapFor(chunk, "mismatch");
    return {
      records,
      gap: null,
      drop: dropFor(chunk),
      arrivedAt: null
    };
  } catch {
    return gapFor(chunk, "json");
  }
};

/**
 * What this sheet has already opened for one session, so a poll, a further page or a change of range
 * downloads only what is new. Plaintext, so it belongs to the hook instance that made it and is never
 * module-level.
 */
export const createActivityChunkCache = (sessionId: string) => {
  // Set once the sheet's first page has finished opening. Anything opened after it arrived while the
  // sheet was being watched, rather than as part of what it opened with.
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

export type TAgentVaultActivityChunkCache = ReturnType<typeof createActivityChunkCache>;

/**
 * Opens every chunk on one page. A failed download is the one result left out of the cache: the object
 * and the key were fine, the link was not, and the next fetch brings a freshly presigned one. Every
 * other gap is a property of the object or the key and would fail the same way again.
 */
export const decryptActivityPage = async (
  page: TAgentVaultActivityPage,
  cache: TAgentVaultActivityChunkCache,
  signal?: AbortSignal
): Promise<TAgentVaultDecryptedActivityPage> => {
  const decrypted: Record<string, TAgentVaultDecryptedChunk> = {};
  const { sessionKey } = page;
  if (!sessionKey || !page.chunks.length) {
    // Settled even with nothing to open, or the first requests a quiet session makes would count as
    // part of its first load and never be marked as arriving.
    cache.settle();
    return { ...page, decrypted };
  }

  let keyPromise = cache.keys.get(sessionKey);
  if (!keyPromise) {
    // Async so a malformed key rejects rather than throwing out of the query function.
    keyPromise = (async () =>
      crypto.subtle.importKey("raw", base64ToBytes(sessionKey), "AES-GCM", false, ["decrypt"]))();
    cache.keys.set(sessionKey, keyPromise);
  }
  // An unusable key fails every chunk the same way, so they are all marked rather than tried.
  const key = await keyPromise.catch(() => null);
  const context = { projectId: page.projectId, sessionId: cache.sessionId };
  const opened: string[] = [];

  await Promise.all(
    page.chunks.map(async (chunk) => {
      const known = cache.chunks.get(chunk.chunkId);
      if (known) {
        decrypted[chunk.chunkId] = known;
        return;
      }
      const result = key ? await openChunk(chunk, key, context, signal) : gapFor(chunk, "gcm");
      if (result.gap?.reason !== "fetch") cache.chunks.set(chunk.chunkId, result);
      decrypted[chunk.chunkId] = result;
      opened.push(chunk.chunkId);
    })
  );

  // Stamped once the whole page is ready rather than as each chunk opens: the rows reach the screen
  // together, and a chunk that opened early would otherwise spend its window waiting on the slowest.
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

/**
 * Folds one read of what arrived into everything read that way so far. The newer copy of a chunk wins:
 * reads overlap, and a chunk whose download failed comes back in the overlap with a fresh link.
 */
export const mergeActivityPages = (
  previous: TAgentVaultDecryptedActivityPage | undefined,
  page: TAgentVaultDecryptedActivityPage
): TAgentVaultDecryptedActivityPage => {
  if (!previous) return page;
  const reread = new Set(page.chunks.map((chunk) => chunk.chunkId));
  return {
    ...page,
    chunks: [...previous.chunks.filter((chunk) => !reread.has(chunk.chunkId)), ...page.chunks],
    decrypted: { ...previous.decrypted, ...page.decrypted }
  };
};

export type TAgentVaultActivityTimeline = {
  records: TAgentVaultActivityRecord[];
  gaps: TAgentVaultActivityGap[];
  drops: TAgentVaultActivityDrop[];
  /** When each record arrived, by `activityRecordKey`, for records that came after the first load. */
  arrivals: Map<string, number>;
  isTruncated: boolean;
  /** Whether the chunks opened so far reach AGENT_VAULT_ACTIVITY_MAX_LOADED_BYTES. Implies isTruncated. */
  isOverByteBudget: boolean;
};

/** Merges the proxies' streams across every loaded page into one timeline. */
export const useAgentVaultActivityTimeline = (
  pages: TAgentVaultDecryptedActivityPage[] | undefined
): TAgentVaultActivityTimeline =>
  useMemo(() => {
    // Chunks are identified across pages by their own id: the live reads and a page can both hold one,
    // and so can two pages after a refetch moves a boundary.
    const opened = new Map<string, TAgentVaultDecryptedChunk>();
    const openedBytes = new Map<string, number>();
    (pages ?? []).forEach((page) =>
      page.chunks.forEach((chunk) => {
        const result = page.decrypted[chunk.chunkId];
        if (!result) return;
        const known = opened.get(chunk.chunkId);
        // A failed download is the one outcome a later fetch can change, so a copy that opened beats it.
        if (known && (known.gap?.reason !== "fetch" || result.gap?.reason === "fetch")) return;
        opened.set(chunk.chunkId, result);
        openedBytes.set(chunk.chunkId, chunk.ciphertextBytes);
      })
    );

    const records: TAgentVaultActivityRecord[] = [];
    const gaps: TAgentVaultActivityGap[] = [];
    const drops: TAgentVaultActivityDrop[] = [];
    const arrivals = new Map<string, number>();
    // Only chunks that opened: one that failed to download, or sits in a bucket no longer configured, holds
    // nothing in memory however large it was declared.
    let loadedBytes = 0;

    opened.forEach((result, chunkId) => {
      records.push(...result.records);
      if (!result.gap) loadedBytes += openedBytes.get(chunkId) ?? 0;
      if (result.arrivedAt !== null) {
        const { arrivedAt } = result;
        result.records.forEach((record) => arrivals.set(activityRecordKey(record), arrivedAt));
      }
      if (result.gap) gaps.push(result.gap);
      if (result.drop) drops.push(result.drop);
    });

    // Newest first. Sequence numbers are per proxy, so they settle ties only within one proxy; across
    // proxies this is wall-clock order and adjacent lines can be a second out of order.
    records.sort((a, b) => {
      const byTime = Date.parse(b.ts) - Date.parse(a.ts);
      if (byTime !== 0) return byTime;
      if (a.proxyId !== b.proxyId) return a.proxyId < b.proxyId ? -1 : 1;
      return b.seq - a.seq;
    });

    const isOverByteBudget = loadedBytes >= AGENT_VAULT_ACTIVITY_MAX_LOADED_BYTES;
    return {
      records: records.slice(0, AGENT_VAULT_ACTIVITY_MAX_RECORDS),
      gaps,
      drops,
      arrivals,
      isTruncated: records.length > AGENT_VAULT_ACTIVITY_MAX_RECORDS || isOverByteBudget,
      isOverByteBudget
    };
  }, [pages]);
