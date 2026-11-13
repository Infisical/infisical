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
  hasOpenedRecords: boolean;
  gaps: TAgentVaultSessionLogGap[];
  arrivals: Map<string, number>;
  isTruncated: boolean;
  isOverByteBudget: boolean;
  hasUploadingChunks: boolean;
};

type TSessionLogTimeRange = { from: number; to: number };

export const buildSessionLogTimeline = (
  pages: TAgentVaultDecryptedSessionLogPage[] | undefined,
  now: number,
  range?: TSessionLogTimeRange
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
  let hasOpenedRecords = false;

  // A date range also lists the chunks just after it, so records outside it are left out before the record limit.
  const isInRange = (record: TAgentVaultSessionLogRecord) => {
    if (!range) return true;
    const at = Date.parse(record.ts);
    return at >= range.from && at <= range.to;
  };

  opened.forEach((result, chunkKey) => {
    if (result.records.length) hasOpenedRecords = true;
    const inRange = range ? result.records.filter(isInRange) : result.records;
    records.push(...inRange);
    if (!result.gap) loadedBytes += openedBytes.get(chunkKey) ?? 0;
    if (result.arrivedAt !== null) {
      const { arrivedAt } = result;
      inRange.forEach((record) => arrivals.set(sessionLogRecordKey(record), arrivedAt));
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
    hasOpenedRecords,
    gaps,
    arrivals,
    isTruncated: records.length > AGENT_VAULT_SESSION_LOG_MAX_RECORDS || isOverByteBudget,
    isOverByteBudget,
    hasUploadingChunks
  };
};

export const useAgentVaultSessionLogTimeline = (
  pages: TAgentVaultDecryptedSessionLogPage[] | undefined,
  now: number,
  rangeFrom?: number,
  rangeTo?: number
): TAgentVaultSessionLogTimeline =>
  useMemo(
    () =>
      buildSessionLogTimeline(
        pages,
        now,
        rangeFrom !== undefined && rangeTo !== undefined
          ? { from: rangeFrom, to: rangeTo }
          : undefined
      ),
    [pages, now, rangeFrom, rangeTo]
  );
