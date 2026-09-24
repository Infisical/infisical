import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";

import {
  createActivityChunkCache,
  decryptActivityPage,
  parseActivityRecords,
  recordsMatchChunk
} from "./activityDecrypt";
import { TAgentVaultActivityPage } from "./types";

const record = {
  ts: "2026-09-23T10:00:00.000Z",
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
};

describe("parseActivityRecords", () => {
  it("accepts records in the shape the proxy writes", () => {
    assert.deepEqual(parseActivityRecords([record]), [record]);
  });

  it("refuses a record whose host is not a string, which search would throw on", () => {
    assert.equal(parseActivityRecords([record, { ...record, host: 42 }]), null);
  });

  it("refuses a record whose timestamp is not a date, which the table would throw on", () => {
    assert.equal(parseActivityRecords([{ ...record, ts: "nope" }]), null);
  });

  it("refuses anything that is not an array of records", () => {
    assert.equal(parseActivityRecords({ records: [record] }), null);
  });
});

describe("recordsMatchChunk", () => {
  const chunk = { proxyId: "proxy-1", recordCount: 2, firstSeq: 10, lastSeq: 12 };
  const records = parseActivityRecords([
    { ...record, seq: 10 },
    { ...record, seq: 12 }
  ])!;

  it("accepts records that match the batch they came in, gaps in the sequence included", () => {
    assert.equal(recordsMatchChunk(records, chunk), true);
  });

  it("refuses a record that claims another proxy", () => {
    assert.equal(
      recordsMatchChunk([records[0], { ...records[1], proxyId: "proxy-2" }], chunk),
      false
    );
  });

  it("refuses more or fewer records than the batch counts", () => {
    assert.equal(recordsMatchChunk(records.slice(0, 1), chunk), false);
  });

  it("refuses a sequence number outside the batch's range", () => {
    assert.equal(recordsMatchChunk([records[0], { ...records[1], seq: 13 }], chunk), false);
  });
});

describe("decryptActivityPage", () => {
  const chunkId = "01K5ABCDEFGHJKMNPQRSTVWXYZ";
  const page: TAgentVaultActivityPage = {
    enabled: true,
    sessionKey: btoa("\0".repeat(32)),
    projectId: "project-1",
    configVersion: 1,
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
        configVersion: 1,
        ciphertextBytes: 64,
        iv: "qrvM3e7/ABEiM0RV",
        presignedGetUrl: "https://bucket.example/chunk"
      }
    ],
    nextCursor: null,
    hasMore: false,
    nextReceivedAfter: record.ts,
    storageUnavailable: null
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const openTwice = async (download: () => Promise<Response>) => {
    const fetchMock = vi.fn(download);
    vi.stubGlobal("fetch", fetchMock);
    const cache = createActivityChunkCache("session-1");
    const first = await decryptActivityPage(page, cache);
    await decryptActivityPage(page, cache);
    return { reason: first.decrypted[chunkId].gap?.reason, downloads: fetchMock.mock.calls.length };
  };

  it("tells an object the bucket no longer has apart from a blocked request, and tries it again", async () => {
    assert.deepEqual(await openTwice(async () => new Response(null, { status: 404 })), {
      reason: "missing",
      downloads: 2
    });
  });

  it("reports a download the bucket refused, and tries it again", async () => {
    assert.deepEqual(await openTwice(async () => new Response(null, { status: 403 })), {
      reason: "refused",
      downloads: 2
    });
  });

  it("keeps a request the browser could not make as a failed download, and tries it again", async () => {
    assert.deepEqual(
      await openTwice(async () => {
        throw new TypeError("Failed to fetch");
      }),
      { reason: "fetch", downloads: 2 }
    );
  });
});
