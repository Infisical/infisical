import { beforeEach, describe, expect, it, vi } from "vitest";

import { TSecretSyncPayload } from "../secret-sync-payload";
import { CloudflareSecretsStoreSyncFns } from "./cloudflare-secrets-store-sync-fns";
import {
  TCloudflareSecretsStoreSecret,
  TCloudflareSecretsStoreSyncWithCredentials
} from "./cloudflare-secrets-store-sync-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn().mockResolvedValue({}),
  patch: vi.fn().mockResolvedValue({}),
  del: vi.fn().mockResolvedValue({})
}));
vi.mock("@app/lib/validator", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  safeRequest: { get, post, patch, delete: del }
}));

const SECRETS_URL = "https://api.cloudflare.com/client/v4/accounts/account-id/secrets_store/stores/store-id/secrets";

const syncWith = (syncOptions: Record<string, unknown> = {}) =>
  ({
    destination: "cloudflare-secrets-store",
    destinationConfig: { storeId: "store-id", scopes: ["workers"] },
    environment: { slug: "prod" },
    syncOptions: { disableSecretDeletion: false, ...syncOptions },
    connection: { credentials: { apiToken: "token", accountId: "account-id" } }
  }) as unknown as TCloudflareSecretsStoreSyncWithCredentials;

const payloadOf = (keys: string[]) =>
  ({
    flatten: () => Object.fromEntries(keys.map((key) => [key, { value: `${key}-value` }]))
  }) as unknown as TSecretSyncPayload;

// Cloudflare's Secrets Store list endpoints report `total_count` but never `total_pages`.
const stubCloudflare = (
  pages: TCloudflareSecretsStoreSecret[][],
  { quota = 100, usage = 0, totalCount = pages.flat().length } = {}
) =>
  get.mockImplementation(async (url: string, config?: { params?: { page: number } }) =>
    url.endsWith("/quota")
      ? { data: { result: { secrets: { quota, usage } } } }
      : { data: { result: pages[(config?.params?.page ?? 1) - 1] ?? [], result_info: { total_count: totalCount } } }
  );

describe("CloudflareSecretsStoreSyncFns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects names Cloudflare would refuse before sending any request", async () => {
    await expect(
      CloudflareSecretsStoreSyncFns.syncSecrets(syncWith(), payloadOf(["VALID", "my-key.v2"]))
    ).rejects.toThrow("not a valid Cloudflare Secrets Store secret name: my-key.v2");

    expect(get).not.toHaveBeenCalled();
  });

  it("refuses a sync that would exceed the quota without writing anything", async () => {
    stubCloudflare([[]], { usage: 100 });

    await expect(CloudflareSecretsStoreSyncFns.syncSecrets(syncWith(), payloadOf(["NEW"]))).rejects.toThrow(
      "exceeds the Cloudflare account's limit of 100"
    );

    expect(post).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("writes with the sync's scopes, then deletes only stale secrets the key schema owns", async () => {
    stubCloudflare([
      [
        { id: "keep", name: "INF_KEEP" },
        { id: "stale", name: "INF_STALE" },
        { id: "manual", name: "MANUAL" }
      ]
    ]);

    await CloudflareSecretsStoreSyncFns.syncSecrets(
      syncWith({ keySchema: "INF_{{secretKey}}" }),
      payloadOf(["INF_KEEP", "INF_NEW"])
    );

    expect(patch).toHaveBeenCalledWith(
      `${SECRETS_URL}/keep`,
      { value: "INF_KEEP-value", scopes: ["workers"] },
      expect.anything()
    );
    expect(post).toHaveBeenCalledWith(
      SECRETS_URL,
      [{ name: "INF_NEW", value: "INF_NEW-value", scopes: ["workers"] }],
      expect.anything()
    );
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(`${SECRETS_URL}/stale`, expect.anything());
    expect(del.mock.invocationCallOrder[0]).toBeGreaterThan(
      Math.max(post.mock.invocationCallOrder[0], patch.mock.invocationCallOrder[0])
    );
  });

  it.each([
    ["create", post, ["KEEP", "NEW"]],
    ["update", patch, ["NEW", "KEEP"]]
  ])("deletes nothing when a %s fails after an earlier write succeeded", async (_, failingWrite, keys) => {
    stubCloudflare([
      [
        { id: "keep", name: "KEEP" },
        { id: "stale", name: "STALE" }
      ]
    ]);
    failingWrite.mockRejectedValueOnce(new Error("Cloudflare is unavailable"));

    await expect(CloudflareSecretsStoreSyncFns.syncSecrets(syncWith(), payloadOf(keys))).rejects.toThrow();

    expect(post.mock.calls.length + patch.mock.calls.length).toBe(2);
    expect(del).not.toHaveBeenCalled();
  });

  it("reads every page when Cloudflare reports only total_count", async () => {
    stubCloudflare([[{ id: "first", name: "FIRST" }], [{ id: "second", name: "SECOND" }]], { totalCount: 51 });

    await CloudflareSecretsStoreSyncFns.removeSecrets(syncWith(), payloadOf(["FIRST", "SECOND"]));

    expect(del).toHaveBeenCalledWith(`${SECRETS_URL}/first`, expect.anything());
    expect(del).toHaveBeenCalledWith(`${SECRETS_URL}/second`, expect.anything());
  });
});
