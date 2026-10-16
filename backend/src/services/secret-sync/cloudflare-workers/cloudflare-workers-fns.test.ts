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

const syncWith = (syncOptions: Record<string, unknown>) =>
  ({
    destination: "cloudflare-workers",
    destinationConfig: { scriptId: "my-worker" },
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

const patchedBindings = async () => {
  const [, formData] = patch.mock.calls[0] as [string, FormData];
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
      syncWith({ variableType: CloudflareWorkersVariableType.Text }),
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
        syncWith({ variableType: CloudflareWorkersVariableType.Json }),
        payloadOf({ VALID: '{"a":1}', BROKEN: "not json" })
      )
    ).rejects.toThrow("cannot be synced as Cloudflare Workers JSON variables: BROKEN.");

    expect(get).not.toHaveBeenCalled();
  });

  it("removes only variables of the sync's type", async () => {
    stubWorker([
      { type: "plain_text", name: "TEXT_VAR", text: "a" },
      { type: "secret_text", name: "SECRET_VAR" }
    ]);

    await CloudflareWorkersSyncFns.removeSecrets(
      syncWith({ variableType: CloudflareWorkersVariableType.Text }),
      payloadOf({ TEXT_VAR: "a", SECRET_VAR: "b" })
    );

    expect(patch).toHaveBeenCalledTimes(1);
    expect(await patchedBindings()).toEqual([{ type: "secret_text", name: "SECRET_VAR" }]);
  });
});
