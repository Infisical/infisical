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

export const AGENT_VAULT_ACTIVITY_MAX_RECORDS = 100_000;

export const AGENT_VAULT_ACTIVITY_MAX_LOADED_BYTES = 64 * 1024 * 1024;

const CHUNK_DOWNLOAD_TIMEOUT_MS = 60_000;

const AAD_VERSION = "v1";

export const activityRecordKey = (record: TAgentVaultActivityRecord) =>
  `${record.proxyId}-${record.seq}-${record.ts}`;

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

// Must byte-match the AAD the Go proxy seals each chunk with.
const buildAad = async (parts: {
  projectId: string;
  sessionId: string;
  proxyId: string;
  chunkId: string;
}) => {
  const source = `${parts.projectId}|${parts.sessionId}|${parts.proxyId}|${parts.chunkId}|${AAD_VERSION}`;
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
};

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
  drop: dropFor(chunk),
  arrivedAt: null
});

export const isRetryableActivityGap = (reason?: TAgentVaultActivityGapReason) =>
  reason === "fetch" || reason === "missing" || reason === "refused";

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
    const res = await fetch(chunk.presignedGetUrl, {
      credentials: "omit",
      signal: download.signal
    });
    if (!res.ok) return gapFor(chunk, res.status === 404 ? "missing" : "refused");
    body = await res.arrayBuffer();
  } catch (error) {
    if (signal?.aborted) throw error;
    return gapFor(chunk, "fetch");
  } finally {
    download.clear();
  }

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

export const createActivityChunkCache = (sessionId: string) => {
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

export const decryptActivityPage = async (
  page: TAgentVaultActivityPage,
  cache: TAgentVaultActivityChunkCache,
  signal?: AbortSignal
): Promise<TAgentVaultDecryptedActivityPage> => {
  const decrypted: Record<string, TAgentVaultDecryptedChunk> = {};
  const { sessionKey } = page;
  if (!sessionKey || !page.chunks.length) {
    // Rows that could not be opened have not been shown, so the load that finally opens them is the first one.
    if (!page.storageUnavailable) cache.settle();
    return { ...page, decrypted };
  }

  let keyPromise = cache.keys.get(sessionKey);
  if (!keyPromise) {
    keyPromise = (async () =>
      crypto.subtle.importKey("raw", base64ToBytes(sessionKey), "AES-GCM", false, ["decrypt"]))();
    cache.keys.set(sessionKey, keyPromise);
  }
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
      // Failed downloads stay uncached so the next fetch retries with a freshly presigned URL.
      if (!isRetryableActivityGap(result.gap?.reason)) cache.chunks.set(chunk.chunkId, result);
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
  arrivals: Map<string, number>;
  isTruncated: boolean;
  isOverByteBudget: boolean;
};

export const useAgentVaultActivityTimeline = (
  pages: TAgentVaultDecryptedActivityPage[] | undefined
): TAgentVaultActivityTimeline =>
  useMemo(() => {
    const opened = new Map<string, TAgentVaultDecryptedChunk>();
    const openedBytes = new Map<string, number>();
    (pages ?? []).forEach((page) =>
      page.chunks.forEach((chunk) => {
        const result = page.decrypted[chunk.chunkId];
        if (!result) return;
        const known = opened.get(chunk.chunkId);
        if (
          known &&
          (!isRetryableActivityGap(known.gap?.reason) || isRetryableActivityGap(result.gap?.reason))
        )
          return;
        opened.set(chunk.chunkId, result);
        openedBytes.set(chunk.chunkId, chunk.ciphertextBytes);
      })
    );

    const records: TAgentVaultActivityRecord[] = [];
    const gaps: TAgentVaultActivityGap[] = [];
    const drops: TAgentVaultActivityDrop[] = [];
    const arrivals = new Map<string, number>();
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

    const times = new Map<TAgentVaultActivityRecord, number>();
    records.forEach((record) => times.set(record, Date.parse(record.ts)));
    records.sort((a, b) => {
      const byTime = (times.get(b) as number) - (times.get(a) as number);
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
