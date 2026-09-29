import { useMemo } from "react";

import { isRetryableResult } from "./sessionLogDecrypt";
import {
  TAgentVaultDecryptedChunk,
  TAgentVaultDecryptedSessionLogPage,
  TAgentVaultSessionLogDrop,
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
  drops: TAgentVaultSessionLogDrop[];
  arrivals: Map<string, number>;
  isTruncated: boolean;
  isOverByteBudget: boolean;
  hasUploadingChunks: boolean;
};

export const useAgentVaultSessionLogTimeline = (
  pages: TAgentVaultDecryptedSessionLogPage[] | undefined
): TAgentVaultSessionLogTimeline =>
  useMemo(() => {
    const opened = new Map<string, TAgentVaultDecryptedChunk>();
    const openedBytes = new Map<string, number>();
    const dropsByChunk = new Map<string, TAgentVaultSessionLogDrop>();
    (pages ?? []).forEach((page) =>
      page.chunks.forEach((chunk) => {
        const result = page.decrypted[chunk.chunkId];
        if (!result) return;
        if (chunk.droppedCount > 0) {
          const { chunkId, proxyId, startedAt, droppedCount } = chunk;
          dropsByChunk.set(chunkId, { chunkId, proxyId, startedAt, droppedCount });
        }
        const known = opened.get(chunk.chunkId);
        if (known && (!isRetryableResult(known) || isRetryableResult(result))) return;
        opened.set(chunk.chunkId, result);
        openedBytes.set(chunk.chunkId, chunk.ciphertextBytes);
      })
    );

    const records: TAgentVaultSessionLogRecord[] = [];
    const gaps: TAgentVaultSessionLogGap[] = [];
    const arrivals = new Map<string, number>();
    let loadedBytes = 0;

    opened.forEach((result, chunkId) => {
      records.push(...result.records);
      if (!result.gap && !result.isUploading) loadedBytes += openedBytes.get(chunkId) ?? 0;
      if (result.arrivedAt !== null) {
        const { arrivedAt } = result;
        result.records.forEach((record) => arrivals.set(sessionLogRecordKey(record), arrivedAt));
      }
      if (result.gap) gaps.push(result.gap);
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
      drops: [...dropsByChunk.values()],
      arrivals,
      isTruncated: records.length > AGENT_VAULT_SESSION_LOG_MAX_RECORDS || isOverByteBudget,
      isOverByteBudget,
      hasUploadingChunks: [...opened.values()].some((result) => result.isUploading)
    };
  }, [pages]);
