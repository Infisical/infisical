import { useEffect, useMemo, useRef, useState } from "react";

import {
  TAgentVaultActivityChunk,
  TAgentVaultActivityDrop,
  TAgentVaultActivityGap,
  TAgentVaultActivityGapReason,
  TAgentVaultActivityPage,
  TAgentVaultActivityRecord
} from "./types";

/**
 * Stop accumulating past this many records across loaded pages. The table is not virtualised, and a
 * viewer who has paged this far is looking for a filter rather than more rows.
 */
export const AGENT_VAULT_ACTIVITY_MAX_RECORDS = 100_000;

const AAD_VERSION = "v1";

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

type TDecryptedChunk = {
  records: TAgentVaultActivityRecord[];
  gap: TAgentVaultActivityGap | null;
  drop: TAgentVaultActivityDrop | null;
};

const gapFor = (
  chunk: TAgentVaultActivityChunk,
  reason: TAgentVaultActivityGapReason
): TDecryptedChunk => ({
  records: [],
  gap: {
    chunkId: chunk.chunkId,
    proxyId: chunk.proxyId,
    proxyName: chunk.proxyName,
    startedAt: chunk.startedAt,
    reason,
    recordCount: chunk.recordCount
  },
  drop: null
});

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

const openChunk = async (
  chunk: TAgentVaultActivityChunk,
  key: CryptoKey,
  context: { projectId: string; sessionId: string }
): Promise<TDecryptedChunk> => {
  if (!chunk.presignedGetUrl) return gapFor(chunk, "repointed");

  let body: ArrayBuffer;
  try {
    // credentials omitted: S3 rejects a request that carries cookies against a presigned signature.
    const res = await fetch(chunk.presignedGetUrl, { credentials: "omit" });
    if (!res.ok) return gapFor(chunk, "fetch");
    body = await res.arrayBuffer();
  } catch {
    return gapFor(chunk, "fetch");
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
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext));
    if (!Array.isArray(parsed)) return gapFor(chunk, "json");
    return { records: parsed as TAgentVaultActivityRecord[], gap: null, drop: dropFor(chunk) };
  } catch {
    return gapFor(chunk, "json");
  }
};

export type TAgentVaultActivityTimeline = {
  records: TAgentVaultActivityRecord[];
  gaps: TAgentVaultActivityGap[];
  drops: TAgentVaultActivityDrop[];
  isDecrypting: boolean;
  isTruncated: boolean;
};

/**
 * Fetches and opens every chunk in the loaded pages, then merges the proxies' streams into one timeline.
 *
 * A chunk is opened once and remembered: paging or a poll adds chunks, it does not re-decrypt what is
 * already on screen. The key is imported once into a ref for the same reason.
 */
export const useDecryptedAgentVaultActivity = (
  pages: TAgentVaultActivityPage[] | undefined,
  sessionId: string | undefined
): TAgentVaultActivityTimeline => {
  const [opened, setOpened] = useState<Record<string, TDecryptedChunk>>({});
  const [isDecrypting, setIsDecrypting] = useState(false);
  const keyRef = useRef<{ raw: string; key: Promise<CryptoKey> } | null>(null);
  // The url a download last failed on, per chunk. Retrying the same url would just fail the same way,
  // so a retry waits for the poll to hand back a freshly presigned one.
  const failedUrlRef = useRef<Record<string, string>>({});

  const sessionKey = pages?.find((page) => page.sessionKey)?.sessionKey ?? null;
  const projectId = pages?.[0]?.projectId;

  // Chunks are identified across pages by their own id, which is unique per session.
  const chunks = useMemo(() => {
    const byId = new Map<string, TAgentVaultActivityChunk>();
    (pages ?? []).forEach((page) => page.chunks.forEach((chunk) => byId.set(chunk.chunkId, chunk)));
    return [...byId.values()];
  }, [pages]);

  useEffect(() => {
    // A different session, or a key that changed, invalidates everything already opened.
    setOpened({});
    keyRef.current = null;
    failedUrlRef.current = {};
  }, [sessionId, sessionKey]);

  useEffect(() => {
    if (!sessionKey || !projectId || !sessionId) return undefined;

    // A download that failed is worth another go, because a presigned url expires while a long
    // timeline is open and the poll hands back a fresh one: the bytes were fine, the link was not.
    // Only when the url has actually changed, so this waits for new data rather than hammering the
    // same dead link, and only for a fetch failure. The other reasons are properties of the stored
    // object or the key, and would fail identically however many times they were tried.
    const isWorthRetrying = (chunk: TAgentVaultActivityChunk) =>
      opened[chunk.chunkId]?.gap?.reason === "fetch" &&
      Boolean(chunk.presignedGetUrl) &&
      chunk.presignedGetUrl !== failedUrlRef.current[chunk.chunkId];

    const pending = chunks.filter((chunk) => !(chunk.chunkId in opened) || isWorthRetrying(chunk));
    if (!pending.length) return undefined;

    let cancelled = false;
    setIsDecrypting(true);

    if (!keyRef.current || keyRef.current.raw !== sessionKey) {
      keyRef.current = {
        raw: sessionKey,
        key: crypto.subtle.importKey("raw", base64ToBytes(sessionKey), "AES-GCM", false, [
          "decrypt"
        ])
      };
    }

    const run = async () => {
      try {
        const key = await keyRef.current!.key;
        const results = await Promise.all(
          pending.map(
            async (chunk) =>
              [chunk.chunkId, await openChunk(chunk, key, { projectId, sessionId })] as const
          )
        );
        if (cancelled) return;
        pending.forEach((chunk) => {
          const result = results.find(([chunkId]) => chunkId === chunk.chunkId)?.[1];
          if (result?.gap?.reason === "fetch" && chunk.presignedGetUrl) {
            failedUrlRef.current[chunk.chunkId] = chunk.presignedGetUrl;
          }
        });
        setOpened((prev) => ({ ...prev, ...Object.fromEntries(results) }));
      } catch {
        if (cancelled) return;
        // An unusable key fails every chunk the same way, so they are all marked rather than retried.
        setOpened((prev) => ({
          ...prev,
          ...Object.fromEntries(pending.map((chunk) => [chunk.chunkId, gapFor(chunk, "gcm")]))
        }));
      } finally {
        if (!cancelled) setIsDecrypting(false);
      }
    };

    run().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [chunks, opened, sessionKey, projectId, sessionId]);

  return useMemo(() => {
    const records: TAgentVaultActivityRecord[] = [];
    const gaps: TAgentVaultActivityGap[] = [];
    const drops: TAgentVaultActivityDrop[] = [];

    chunks.forEach((chunk) => {
      const result = opened[chunk.chunkId];
      if (!result) return;
      records.push(...result.records);
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

    return {
      records: records.slice(0, AGENT_VAULT_ACTIVITY_MAX_RECORDS),
      gaps,
      drops,
      isDecrypting,
      isTruncated: records.length > AGENT_VAULT_ACTIVITY_MAX_RECORDS
    };
  }, [chunks, opened, isDecrypting]);
};
