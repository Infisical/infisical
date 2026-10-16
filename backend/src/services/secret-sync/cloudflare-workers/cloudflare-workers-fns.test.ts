import { beforeEach, describe, expect, it, vi } from "vitest";

import { TSecretSyncPayload } from "../secret-sync-payload";
import { CloudflareWorkersVariableType } from "./cloudflare-workers-constants";
import { CloudflareWorkersSyncFns } from "./cloudflare-workers-fns";
import { TCloudflareWorkersSyncWithCredentials } from "./cloudflare-workers-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { get, patch } = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn().mockResolvedValue({ data: { success: true } })
}));
vi.mock("@app/lib/config/request", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  request: { get, patch }
}));

type TBinding = { type: string; name: string; text?: string; json?: unknown };

const syncWith = (variableType?: CloudflareWorkersVariableType) =>
  ({
    destination: "cloudflare-workers",
    destinationConfig: { scriptId: "my-worker", variableType },
    environment: { slug: "prod" },
    syncOptions: { disableSecretDeletion: false },
    connection: { credentials: { apiToken: "token", accountId: "account-id" } }
  }) as unknown as TCloudflareWorkersSyncWithCredentials;

const payloadOf = (secrets: Record<string, string>) =>
  ({
    flatten: () => Object.fromEntries(Object.entries(secrets).map(([key, value]) => [key, { value }]))
  }) as unknown as TSecretSyncPayload;

const stubWorker = (bindings: TBinding[]) =>
  get.mockImplementation(async (url: string) =>
    url.endsWith("/secrets")
      ? { data: { result: bindings.filter(({ type }) => type === "secret_text") } }
      : { data: { result: { bindings } } }
  );

const patchedBindings = async (call = 0) => {
  const [, formData] = patch.mock.calls[call] as [string, FormData];
  return (JSON.parse(await (formData.get("settings") as Blob).text()) as { bindings: TBinding[] }).bindings;
};

describe("CloudflareWorkersSyncFns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes text variables in one settings update, replacing a same-name secret and deleting only stale text variables", async () => {
    stubWorker([
      { type: "secret_text", name: "API_KEY" },
      { type: "plain_text", name: "STALE", text: "old" },
      { type: "json", name: "CONFIG", json: { a: 1 } },
      { type: "kv_namespace", name: "CACHE" }
    ]);

    await CloudflareWorkersSyncFns.syncSecrets(
      syncWith(CloudflareWorkersVariableType.Text),
      payloadOf({ API_KEY: "key", NEW_VAR: "new" })
    );

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch.mock.calls[0][0]).toMatch(/\/workers\/scripts\/my-worker\/settings$/);
    expect(await patchedBindings()).toEqual([
      { type: "json", name: "CONFIG", json: { a: 1 } },
      { type: "kv_namespace", name: "CACHE" },
      { type: "plain_text", name: "API_KEY", text: "key" },
      { type: "plain_text", name: "NEW_VAR", text: "new" }
    ]);
  });

  it("rejects values that are not JSON before calling Cloudflare", async () => {
    await expect(
      CloudflareWorkersSyncFns.syncSecrets(
        syncWith(CloudflareWorkersVariableType.Json),
        payloadOf({ VALID: '{"a":1}', BROKEN: "not json" })
      )
    ).rejects.toThrow("cannot be synced as Cloudflare Workers JSON variables: BROKEN.");

    expect(get).not.toHaveBeenCalled();
  });

  it("refuses to replace a non-variable binding with the same name", async () => {
    stubWorker([{ type: "kv_namespace", name: "CACHE" }]);

    await expect(
      CloudflareWorkersSyncFns.syncSecrets(syncWith(CloudflareWorkersVariableType.Text), payloadOf({ CACHE: "value" }))
    ).rejects.toThrow(
      "same name as another binding on the Cloudflare Worker, such as a KV namespace or a service: CACHE."
    );

    expect(patch).not.toHaveBeenCalled();
  });

  it("converts a same-name text variable into a secret when Secret is chosen", async () => {
    stubWorker([
      { type: "plain_text", name: "API_URL", text: "old" },
      { type: "kv_namespace", name: "CACHE" }
    ]);

    await CloudflareWorkersSyncFns.syncSecrets(
      syncWith(CloudflareWorkersVariableType.Secret),
      payloadOf({ API_URL: "new" })
    );

    expect(patch).toHaveBeenCalledTimes(1);
    expect(await patchedBindings()).toEqual([
      { type: "secret_text", name: "API_URL", text: "new" },
      { type: "kv_namespace", name: "CACHE" }
    ]);
  });

  it("keeps skipping same-name text variables for syncs saved without a type", async () => {
    stubWorker([{ type: "plain_text", name: "API_URL", text: "old" }]);

    await CloudflareWorkersSyncFns.syncSecrets(syncWith(), payloadOf({ API_URL: "new" }));

    expect(patch).not.toHaveBeenCalled();
  });

  it("removes only variables of the sync's type", async () => {
    stubWorker([
      { type: "plain_text", name: "TEXT_VAR", text: "a" },
      { type: "secret_text", name: "SECRET_VAR" }
    ]);

    await CloudflareWorkersSyncFns.removeSecrets(
      syncWith(CloudflareWorkersVariableType.Text),
      payloadOf({ TEXT_VAR: "a", SECRET_VAR: "b" })
    );

    expect(patch).toHaveBeenCalledTimes(1);
    expect(await patchedBindings()).toEqual([{ type: "secret_text", name: "SECRET_VAR" }]);
  });
});
