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
    activity: {
      enabled: true,
      sessionKey: btoa("\0".repeat(32)),
      storageUnavailable: null
    },
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
        presignedGetUrl: "https://bucket.example/chunk"
      }
    ]
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

  it("tells an object changed after upload apart from one that fails to decrypt, and doesn't download it again", async () => {
    assert.deepEqual(await openTwice(async () => new Response(new Uint8Array(64))), {
      reason: "altered",
      downloads: 1
    });
  });

  // The pinned vector from agent-vault-activity-crypto.test.ts and Go's TestSealMatchesNodeVector.
  it("opens a chunk sealed with the pinned vector", async () => {
    const sealed = Uint8Array.from(
      atob(
        "PLRwxBbgu+W68Br1N9gY1oUy8wjJxQClAtBh0NfJS1UcWOCPn3laS615sIqwFONhPIPNWRI3CA+a5tUJ7aoim0sQkE4d9gzou2mc/AWiCdToVBJPtdumA9jIzh3yAI81YPwcoDXEVnq2+7ooNNJShGdLX95itbrna/t4nFKRKSSgNzbH23eMtSMcSo72puk/2iwh4sVbTKzC2kwvbf1U6Mgd21zkIq2jDKKwhcT6mTfjPivW4FzmmkspQVMoWwANRX+QVyXzrMipZfoq5N/UcUI6rCu64JVIU0dTBbrrs+2AuZxL"
      ),
      (char) => char.charCodeAt(0)
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(sealed))
    );
    const vectorPage: TAgentVaultActivityPage = {
      activity: {
        enabled: true,
        sessionKey: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        storageUnavailable: null
      },
      chunks: [
        {
          ...page.chunks[0],
          startedAt: "2026-09-16T10:31:04.221Z",
          endedAt: "2026-09-16T10:31:04.221Z",
          firstSeq: 1,
          lastSeq: 1,
          ciphertextBytes: sealed.length,
          ciphertextSha256: "zAJPi40E84EYY5c5Ru/eFd89CdaUv/c147qBlQjf8V8"
        }
      ]
    };

    const result = await decryptActivityPage(vectorPage, createActivityChunkCache("sess-1"));

    assert.equal(result.decrypted[chunkId].gap, null);
    assert.equal(result.decrypted[chunkId].records[0].path, "/zen");
  });
});
