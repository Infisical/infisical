import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";

import {
  createSessionLogChunkCache,
  decryptSessionLogPage,
  parseSessionLogRecords,
  recordsMatchChunk,
  sessionLogChunkKey
} from "./sessionLogDecrypt";
import { TAgentVaultSessionLogPage } from "./types";

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

describe("parseSessionLogRecords", () => {
  it("accepts records in the shape the proxy writes", () => {
    assert.deepEqual(parseSessionLogRecords([record]), [record]);
  });

  it("refuses a record whose host is not a string, which search would throw on", () => {
    assert.equal(parseSessionLogRecords([record, { ...record, host: 42 }]), null);
  });

  it("refuses a record whose timestamp is not a date, which the table would throw on", () => {
    assert.equal(parseSessionLogRecords([{ ...record, ts: "nope" }]), null);
  });

  it("refuses anything that is not an array of records", () => {
    assert.equal(parseSessionLogRecords({ records: [record] }), null);
  });
});

describe("recordsMatchChunk", () => {
  const records = parseSessionLogRecords([record, { ...record, seq: 7 }])!;

  it("accepts records from the proxy the chunk is named for", () => {
    assert.equal(recordsMatchChunk(records, { proxyId: "proxy-1" }), true);
  });

  it("refuses a record that claims another proxy", () => {
    assert.equal(
      recordsMatchChunk([records[0], { ...records[1], proxyId: "proxy-2" }], {
        proxyId: "proxy-1"
      }),
      false
    );
  });
});

describe("decryptSessionLogPage", () => {
  const chunkId = "01a0a9c5-231d-7abc-8def-0123456789ab";
  const page: TAgentVaultSessionLogPage = {
    sessionLogs: {
      enabled: true,
      isRecordable: true,
      sessionKey: btoa("\0".repeat(32)),
      storageUnavailable: null
    },
    chunks: [
      {
        chunkId,
        proxyId: "proxy-1",
        sealedAt: "2026-09-23T10:00:05.000Z",
        ciphertextBytes: 64,
        presignedGetUrl: "https://bucket.example/chunk"
      }
    ]
  };
  const key = sessionLogChunkKey(page.chunks[0]);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const openTwice = async (download: () => Promise<Response>) => {
    const fetchMock = vi.fn(download);
    vi.stubGlobal("fetch", fetchMock);
    const cache = createSessionLogChunkCache("session-1");
    const first = await decryptSessionLogPage(page, cache);
    await decryptSessionLogPage(page, cache);
    return { reason: first.decrypted[key].gap?.reason, downloads: fetchMock.mock.calls.length };
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

  it("reports an object that won't decrypt, and doesn't download it again", async () => {
    assert.deepEqual(await openTwice(async () => new Response(new Uint8Array(64))), {
      reason: "gcm",
      downloads: 1
    });
  });

  it("stops reading an object bigger than the chunk it was listed as", async () => {
    assert.deepEqual(await openTwice(async () => new Response(new Uint8Array(65))), {
      reason: "size",
      downloads: 1
    });
  });

  it("never downloads an object too big to be a chunk", async () => {
    const huge: TAgentVaultSessionLogPage = {
      ...page,
      chunks: [{ ...page.chunks[0], ciphertextBytes: 9 * 1024 * 1024 }]
    };
    const fetchMock = vi.fn(async () => new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const result = await decryptSessionLogPage(huge, createSessionLogChunkCache("session-1"));
    assert.equal(result.decrypted[key].gap?.reason, "size");
    assert.equal(fetchMock.mock.calls.length, 0);
  });

  it("dates a missing chunk from when the live tail first handed it over, and only then", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 }))
    );
    const cache = createSessionLogChunkCache("session-1");
    const listed = await decryptSessionLogPage(page, cache);
    assert.equal(listed.decrypted[key].gap?.firstSeenAt, null);

    const tailed = await decryptSessionLogPage(page, cache, undefined, { isTail: true });
    const firstSeenAt = tailed.decrypted[key].gap?.firstSeenAt;
    assert.equal(typeof firstSeenAt, "number");

    const retried = await decryptSessionLogPage(page, cache, undefined, { isTail: true });
    assert.equal(retried.decrypted[key].gap?.firstSeenAt, firstSeenAt);
  });

  it("opens a chunk from a page that carries no key, with the key an earlier page did", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 }))
    );
    const cache = createSessionLogChunkCache("session-1");
    await decryptSessionLogPage(page, cache);
    const keyless = await decryptSessionLogPage(
      { ...page, sessionLogs: { ...page.sessionLogs, sessionKey: null } },
      cache
    );
    assert.equal(keyless.decrypted[key].gap?.reason, "missing");
  });

  // The same object Go's TestSealMatchesTheBrowserVector seals: the IV, then the ciphertext and tag.
  it("opens a chunk sealed with the pinned vector", async () => {
    const sealed = Uint8Array.from(
      atob(
        "qrvM3e7/ABEiM0RVPLRwxBbgu+W68Br1N9gY1oUy8wjJxQClAtBh0NfJS1UcWOCPn3laS615sIqwFONhPIPNWRI3CA+a5tUJ7aoim0sQkE4d9gzou2mc/AWiCdToVBJPtdumA9jIzh3yAI81YPwcoDXEVnq2+7ooNNJShGdLX95itbrna/t4nFKRKSSgNzbH23eMtSMcSo72puk/2iwh4sVbTKzC2kwvbf1U6Mgd21zkIq2jDKKwhcT6mTfjPivW4FzmmkspQVMoWwANRX+QVyXzrMipZfoq5N/UcUI6rCvRUkqg+3ST5GVMelW0mjOO"
      ),
      (char) => char.charCodeAt(0)
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(sealed))
    );
    const vectorPage: TAgentVaultSessionLogPage = {
      sessionLogs: {
        enabled: true,
        isRecordable: true,
        sessionKey: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        storageUnavailable: null
      },
      chunks: [
        {
          ...page.chunks[0],
          sealedAt: "2026-09-16T10:31:04.221Z",
          ciphertextBytes: sealed.length
        }
      ]
    };

    const result = await decryptSessionLogPage(vectorPage, createSessionLogChunkCache("sess-1"));

    assert.equal(result.decrypted[key].gap, null);
    assert.equal(result.decrypted[key].records[0].path, "/zen");
  });
});
