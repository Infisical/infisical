import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { TAgentVaultDecryptedChunk, TAgentVaultDecryptedSessionLogPage } from "./types";
import { buildSessionLogTimeline } from "./useAgentVaultSessionLogTimeline";

const firstSeenAt = Date.parse("2026-09-29T10:00:00.000Z");
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
  sessionLogs: { enabled: true, isRecordable: true, sessionKey: null },
  chunks: [
    {
      chunkId,
      proxyId: "proxy-1",
      ciphertextBytes: 64,
      presignedGetUrl: "https://bucket.example/chunk"
    }
  ],
  decrypted: { [`proxy-1/${chunkId}`]: result }
});

// A tail chunk the bucket didn't have yet when this browser first saw it.
const missing: TAgentVaultDecryptedChunk = {
  records: [],
  gap: { reason: "missing", firstSeenAt },
  arrivedAt: null
};

describe("buildSessionLogTimeline", () => {
  it("shows both proxies' requests when their chunks share an id", () => {
    const chunkFor = (proxyId: string) => ({
      chunkId,
      proxyId,
      ciphertextBytes: 64,
      presignedGetUrl: `https://bucket.example/${proxyId}`
    });
    const opened = (proxyId: string): TAgentVaultDecryptedChunk => ({
      records: [{ ...record, proxyId }],
      gap: null,
      arrivedAt: null
    });
    const timeline = buildSessionLogTimeline(
      [
        {
          ...pageWith(missing),
          chunks: [chunkFor("proxy-1"), chunkFor("proxy-2")],
          decrypted: {
            [`proxy-1/${chunkId}`]: opened("proxy-1"),
            [`proxy-2/${chunkId}`]: opened("proxy-2")
          }
        }
      ],
      firstSeenAt
    );
    assert.deepEqual(timeline.records.map((entry) => entry.proxyId).sort(), ["proxy-1", "proxy-2"]);
  });

  it("holds a chunk that isn't in the bucket yet as still uploading while it is recent", () => {
    const timeline = buildSessionLogTimeline([pageWith(missing)], firstSeenAt + 30_000);
    assert.deepEqual(timeline.gaps, []);
    assert.equal(timeline.hasUploadingChunks, true);
  });

  it("reports it as missing once two minutes have passed, so nothing waits on it forever", () => {
    const timeline = buildSessionLogTimeline([pageWith(missing)], firstSeenAt + 3 * 60_000);
    assert.deepEqual(
      timeline.gaps.map((gap) => gap.reason),
      ["missing"]
    );
    assert.equal(timeline.hasUploadingChunks, false);
  });

  it("reports a chunk listed from the bucket as missing at once, since it was already uploaded", () => {
    const timeline = buildSessionLogTimeline(
      [pageWith({ ...missing, gap: { reason: "missing", firstSeenAt: null } })],
      firstSeenAt + 30_000
    );
    assert.deepEqual(
      timeline.gaps.map((gap) => gap.reason),
      ["missing"]
    );
    assert.equal(timeline.hasUploadingChunks, false);
  });

  it("reports it once even when the live tail and a history reload both hold it", () => {
    const timeline = buildSessionLogTimeline(
      [pageWith(missing), pageWith(missing)],
      firstSeenAt + 3 * 60_000
    );
    assert.equal(timeline.gaps.length, 1);
    assert.equal(timeline.hasUploadingChunks, false);
  });

  it("never holds back a chunk that downloaded", () => {
    const timeline = buildSessionLogTimeline(
      [pageWith({ records: [record], gap: null, arrivedAt: null })],
      firstSeenAt + 30_000
    );
    assert.equal(timeline.records.length, 1);
    assert.equal(timeline.hasUploadingChunks, false);
  });

  it("lets a download that landed replace an earlier miss", () => {
    const timeline = buildSessionLogTimeline(
      [pageWith(missing), pageWith({ records: [record], gap: null, arrivedAt: null })],
      firstSeenAt + 30_000
    );
    assert.equal(timeline.records.length, 1);
    assert.deepEqual(timeline.gaps, []);
    assert.equal(timeline.hasUploadingChunks, false);
  });
});
