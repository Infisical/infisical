import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { TAgentVaultDecryptedChunk, TAgentVaultDecryptedSessionLogPage } from "./types";
import { buildSessionLogTimeline } from "./useAgentVaultSessionLogTimeline";

const createdAt = Date.parse("2026-09-29T10:00:00.000Z");
const chunkId = "01a0a9c5-231d-7abc-8def-0123456789ab";

const record = {
  ts: "2026-09-29T09:59:59.000Z",
  seq: 0,
  proxyId: "proxy-1",
  method: "GET",
  host: "api.github.com",
  port: "443",
  path: "/",
  status: 200,
  decision: "passthrough",
  service: null,
  accessBundle: null
} as TAgentVaultDecryptedChunk["records"][number];

const pageWith = (result: TAgentVaultDecryptedChunk): TAgentVaultDecryptedSessionLogPage => ({
  sessionLogs: { enabled: true, isRecordable: true, sessionKey: null, storageUnavailable: null },
  chunks: [
    {
      chunkId,
      proxyId: "proxy-1",
      proxyName: "proxy",
      startedAt: record.ts,
      endedAt: record.ts,
      firstSeq: 0,
      lastSeq: 0,
      recordCount: 1,
      droppedCount: 0,
      ciphertextBytes: 64,
      iv: "qrvM3e7/ABEiM0RV",
      ciphertextSha256: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU",
      presignedGetUrl: "https://bucket.example/chunk",
      createdAt: new Date(createdAt).toISOString()
    }
  ],
  decrypted: { [chunkId]: result }
});

const missing: TAgentVaultDecryptedChunk = {
  records: [],
  gap: {
    chunkId,
    proxyId: "proxy-1",
    proxyName: "proxy",
    startedAt: record.ts,
    reason: "missing",
    recordCount: 1
  },
  arrivedAt: null
};

describe("buildSessionLogTimeline", () => {
  it("holds a chunk that isn't in the bucket yet as still uploading while it is recent", () => {
    const timeline = buildSessionLogTimeline([pageWith(missing)], createdAt + 30_000);
    assert.deepEqual(timeline.gaps, []);
    assert.equal(timeline.hasUploadingChunks, true);
  });

  it("reports it as missing once two minutes have passed, so nothing waits on it forever", () => {
    const timeline = buildSessionLogTimeline([pageWith(missing)], createdAt + 3 * 60_000);
    assert.deepEqual(
      timeline.gaps.map((gap) => gap.reason),
      ["missing"]
    );
    assert.equal(timeline.hasUploadingChunks, false);
  });

  it("reports it once even when the live tail and a history reload both hold it", () => {
    const timeline = buildSessionLogTimeline(
      [pageWith(missing), pageWith(missing)],
      createdAt + 3 * 60_000
    );
    assert.equal(timeline.gaps.length, 1);
    assert.equal(timeline.hasUploadingChunks, false);
  });

  it("never holds back a chunk that downloaded", () => {
    const timeline = buildSessionLogTimeline(
      [pageWith({ records: [record], gap: null, arrivedAt: null })],
      createdAt + 30_000
    );
    assert.equal(timeline.records.length, 1);
    assert.equal(timeline.hasUploadingChunks, false);
  });

  it("lets a download that landed replace an earlier miss", () => {
    const timeline = buildSessionLogTimeline(
      [pageWith(missing), pageWith({ records: [record], gap: null, arrivedAt: null })],
      createdAt + 30_000
    );
    assert.equal(timeline.records.length, 1);
    assert.deepEqual(timeline.gaps, []);
    assert.equal(timeline.hasUploadingChunks, false);
  });
});
