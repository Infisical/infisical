import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TSecretMetadataPage } from "@app/hooks/api/dashboard/types";

import { fetchCopySecrets, getCopySecretsRetryDelay } from "./copySecrets.data";

const secret = (
  id: string,
  options: Partial<TSecretMetadataPage["secrets"][number]> = {}
): TSecretMetadataPage["secrets"][number] => ({
  id,
  secretKey: "KEY",
  secretPath: "/",
  type: "shared",
  secretValueHidden: false,
  isHoneyTokenSecret: false,
  isRotatedSecret: false,
  ...options
});
const requestError = (status: number, retryAfter?: string) =>
  Object.assign(new Error("Request failed"), {
    isAxiosError: true,
    response: { status, headers: { "retry-after": retryAfter } }
  });

describe("copy source metadata", () => {
  it("reads recursive pages, preserving paths, restrictions and duplicate keys", async () => {
    const calls: [string | undefined, number][] = [];
    const secrets = await fetchCopySecrets(async (cursor, limit) => {
      calls.push([cursor, limit]);
      if (cursor === "page-1")
        return {
          nextCursor: null,
          secrets: [secret("nested", { secretPath: "/nested", secretValueHidden: true })]
        };
      return {
        nextCursor: "page-1",
        secrets: [
          secret("readable"),
          secret("honey", { isHoneyTokenSecret: true }),
          secret("rotation", { isRotatedSecret: true })
        ]
      };
    });
    assert.deepEqual(calls, [
      [undefined, 500],
      ["page-1", 500]
    ]);
    assert.deepEqual(
      secrets.map(({ id }) => id),
      ["readable", "honey", "rotation", "nested"]
    );
    assert.equal(secrets.find(({ id }) => id === "honey")?.isHoneyToken, true);
    assert.equal(secrets.find(({ id }) => id === "rotation")?.isRotated, true);
    assert.deepEqual(secrets.at(-1), {
      id: "nested",
      name: "KEY",
      path: "/nested",
      isValueHidden: true,
      isHoneyToken: false,
      isRotated: false
    });
    assert.equal("secretValue" in secrets[0], false);
  });

  it("does not request individual folders for an empty environment", async () => {
    let calls = 0;
    assert.deepEqual(
      await fetchCopySecrets(async () => {
        calls += 1;
        return { secrets: [], nextCursor: null };
      }),
      []
    );
    assert.equal(calls, 1);
  });

  it("rejects a cursor that moves backwards", async () => {
    const cursors: (string | undefined)[] = [];
    await assert.rejects(
      fetchCopySecrets(async (cursor) => {
        cursors.push(cursor);
        return { secrets: [secret("visible")], nextCursor: cursor ? "page-1" : "page-2" };
      }),
      /Couldn't finish loading secrets/
    );
    assert.deepEqual(cursors, [undefined, "page-2"]);
  });

  it("retries a rate-limited page without discarding previous pages", async () => {
    const cursors: (string | undefined)[] = [];
    const result = await fetchCopySecrets(async (cursor) => {
      cursors.push(cursor);
      if (cursor === "page-1" && cursors.length === 2) throw requestError(429, "0");
      return {
        secrets: [secret(`secret-${cursor ?? "first"}`)],
        nextCursor: cursor ? null : "page-1"
      };
    });
    assert.deepEqual(cursors, [undefined, "page-1", "page-1"]);
    assert.deepEqual(
      result.map(({ id }) => id),
      ["secret-first", "secret-page-1"]
    );
  });

  it("bounds retries and does not return a partial result on failure", async () => {
    const cursors: (string | undefined)[] = [];
    await assert.rejects(
      fetchCopySecrets(async (cursor) => {
        cursors.push(cursor);
        if (cursor) throw requestError(429, "0");
        return { secrets: [secret("one")], nextCursor: "page-1" };
      }),
      /Request failed/
    );
    assert.deepEqual(cursors, [undefined, "page-1", "page-1", "page-1", "page-1"]);
  });

  it("does not retry a permission error", async () => {
    let calls = 0;
    await assert.rejects(
      fetchCopySecrets(async () => {
        calls += 1;
        throw requestError(403);
      }),
      /Request failed/
    );
    assert.equal(calls, 1);
  });

  it("stops paging when the sheet closes or the source changes", async () => {
    const controller = new AbortController();
    let calls = 0;
    await assert.rejects(
      fetchCopySecrets(async () => {
        calls += 1;
        controller.abort();
        return { nextCursor: "page-1", secrets: [secret("one")] };
      }, controller.signal),
      { name: "AbortError" }
    );
    assert.equal(calls, 1);
  });

  it("cancels a rate-limit wait immediately", async () => {
    const controller = new AbortController();
    let calls = 0;
    await assert.rejects(
      fetchCopySecrets(async () => {
        calls += 1;
        setTimeout(() => controller.abort(), 0);
        throw requestError(429, "60");
      }, controller.signal),
      { name: "AbortError" }
    );
    assert.equal(calls, 1);
  });

  it("rejects pagination that makes no progress", async () => {
    await assert.rejects(
      fetchCopySecrets(async () => ({ secrets: [], nextCursor: "page-1" })),
      /Couldn't finish loading secrets/
    );
  });
});

describe("copy rate-limit timing", () => {
  it("honors Retry-After seconds and HTTP dates, falling back to the API window", () => {
    assert.equal(getCopySecretsRetryDelay(requestError(429, "12")), 12_000);
    assert.equal(
      getCopySecretsRetryDelay(
        requestError(429, "Fri, 04 Sep 2026 12:00:15 GMT"),
        Date.parse("2026-09-04T12:00:00Z")
      ),
      15_000
    );
    assert.equal(getCopySecretsRetryDelay(requestError(429)), 60_000);
    assert.equal(getCopySecretsRetryDelay(requestError(429, "invalid")), 60_000);
    assert.equal(getCopySecretsRetryDelay(requestError(403)), null);
  });
});
