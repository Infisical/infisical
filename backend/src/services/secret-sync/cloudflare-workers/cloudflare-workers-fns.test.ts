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

const syncWith = (variableType?: CloudflareWorkersVariableType, syncOptions: Record<string, unknown> = {}) =>
  ({
    destination: "cloudflare-workers",
    destinationConfig: { scriptId: "my-worker", variableType },
    environment: { slug: "prod" },
    syncOptions: { disableSecretDeletion: false, ...syncOptions },
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

  it("writes text variables in one settings update and deletes only stale text variables", async () => {
    stubWorker([
      { type: "plain_text", name: "API_KEY", text: "old" },
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

  it.each([
    [CloudflareWorkersVariableType.Secret, { type: "json", name: "CONFIG", json: { a: 1 } }, "CONFIG (JSON)"],
    [CloudflareWorkersVariableType.Secret, { type: "plain_text", name: "CONFIG", text: "old" }, "CONFIG (text)"],
    [CloudflareWorkersVariableType.Text, { type: "secret_text", name: "CONFIG" }, "CONFIG (secret)"],
    [CloudflareWorkersVariableType.Json, { type: "plain_text", name: "CONFIG", text: "{}" }, "CONFIG (text)"]
  ])("fails a %s sync before writing when a key exists as another type", async (variableType, binding, listed) => {
    stubWorker([binding]);

    await expect(
      CloudflareWorkersSyncFns.syncSecrets(syncWith(variableType), payloadOf({ CONFIG: '{"a":2}', NEW_KEY: "{}" }))
    ).rejects.toThrow(`already exist on the Cloudflare Worker as a different type: ${listed}.`);

    expect(patch).not.toHaveBeenCalled();
  });

  it("skips same-name text and JSON variables on a sync with no saved type", async () => {
    stubWorker([
      { type: "plain_text", name: "API_URL", text: "old" },
      { type: "json", name: "CONFIG", json: { a: 1 } }
    ]);

    await CloudflareWorkersSyncFns.syncSecrets(syncWith(), payloadOf({ API_URL: "new", CONFIG: "{}", NEW_KEY: "n" }));

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch.mock.calls[0][0]).toMatch(/\/secrets-bulk$/);
    expect(patch.mock.calls[0][1]).toEqual({
      secrets: { NEW_KEY: { name: "NEW_KEY", text: "n", type: "secret_text" } }
    });
  });

  it("updates same-name text variables as they are when the toggle is on", async () => {
    stubWorker([{ type: "plain_text", name: "API_URL", text: "old" }]);

    await CloudflareWorkersSyncFns.syncSecrets(
      syncWith(CloudflareWorkersVariableType.Secret, { syncNonSecretBindings: true }),
      payloadOf({ API_URL: "new" })
    );

    expect(patch).toHaveBeenCalledTimes(1);
    expect(await patchedBindings()).toEqual([{ type: "plain_text", name: "API_URL", text: "new" }]);
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
