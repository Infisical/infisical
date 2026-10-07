import { useMemo } from "react";

import {
  isRetryableResult,
  SESSION_LOG_UPLOAD_GRACE_MS,
  sessionLogChunkKey
} from "./sessionLogDecrypt";
import {
  TAgentVaultDecryptedChunk,
  TAgentVaultDecryptedSessionLogPage,
  TAgentVaultSessionLogGap,
  TAgentVaultSessionLogRecord
} from "./types";

const AGENT_VAULT_SESSION_LOG_MAX_RECORDS = 100_000;

const AGENT_VAULT_SESSION_LOG_MAX_LOADED_BYTES = 64 * 1024 * 1024;

export const sessionLogRecordKey = (record: TAgentVaultSessionLogRecord) =>
  `${record.proxyId}-${record.seq}-${record.ts}`;

type TAgentVaultSessionLogTimeline = {
  records: TAgentVaultSessionLogRecord[];
  gaps: TAgentVaultSessionLogGap[];
  arrivals: Map<string, number>;
  isTruncated: boolean;
  isOverByteBudget: boolean;
  hasUploadingChunks: boolean;
};

export const buildSessionLogTimeline = (
  pages: TAgentVaultDecryptedSessionLogPage[] | undefined,
  now: number
): TAgentVaultSessionLogTimeline => {
  const opened = new Map<string, TAgentVaultDecryptedChunk>();
  const openedBytes = new Map<string, number>();
  (pages ?? []).forEach((page) =>
    page.chunks.forEach((chunk) => {
      const chunkKey = sessionLogChunkKey(chunk);
      const result = page.decrypted[chunkKey];
      if (!result) return;
      const known = opened.get(chunkKey);
      if (known && (!isRetryableResult(known) || isRetryableResult(result))) return;
      opened.set(chunkKey, result);
      openedBytes.set(chunkKey, chunk.ciphertextBytes);
    })
  );

  const records: TAgentVaultSessionLogRecord[] = [];
  const gaps: TAgentVaultSessionLogGap[] = [];
  const arrivals = new Map<string, number>();
  let loadedBytes = 0;
  let hasUploadingChunks = false;

  opened.forEach((result, chunkKey) => {
    records.push(...result.records);
    if (!result.gap) loadedBytes += openedBytes.get(chunkKey) ?? 0;
    if (result.arrivedAt !== null) {
      const { arrivedAt } = result;
      result.records.forEach((record) => arrivals.set(sessionLogRecordKey(record), arrivedAt));
    }
    const isUploading =
      result.gap?.reason === "missing" &&
      result.gap.firstSeenAt !== null &&
      now < result.gap.firstSeenAt + SESSION_LOG_UPLOAD_GRACE_MS;
    if (isUploading) hasUploadingChunks = true;
    else if (result.gap) gaps.push(result.gap);
  });

  const times = new Map<TAgentVaultSessionLogRecord, number>();
  records.forEach((record) => times.set(record, Date.parse(record.ts)));
  records.sort((a, b) => {
    const byTime = (times.get(b) as number) - (times.get(a) as number);
    if (byTime !== 0) return byTime;
    if (a.proxyId !== b.proxyId) return a.proxyId < b.proxyId ? -1 : 1;
    return b.seq - a.seq;
  });

  const isOverByteBudget = loadedBytes >= AGENT_VAULT_SESSION_LOG_MAX_LOADED_BYTES;
  return {
    records: records.slice(0, AGENT_VAULT_SESSION_LOG_MAX_RECORDS),
    gaps,
    arrivals,
    isTruncated: records.length > AGENT_VAULT_SESSION_LOG_MAX_RECORDS || isOverByteBudget,
    isOverByteBudget,
    hasUploadingChunks
  };
};

export const useAgentVaultSessionLogTimeline = (
  pages: TAgentVaultDecryptedSessionLogPage[] | undefined,
  now: number
): TAgentVaultSessionLogTimeline =>
  useMemo(() => buildSessionLogTimeline(pages, now), [pages, now]);
