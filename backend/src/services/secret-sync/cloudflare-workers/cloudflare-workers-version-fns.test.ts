import { AxiosError, AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TKeyStoreFactory } from "@app/keystore/keystore";

import { SecretSyncError } from "../secret-sync-errors";
import { TSecretSyncPayload } from "../secret-sync-payload";
import { CloudflareWorkersVariableType } from "./cloudflare-workers-constants";
import { CloudflareWorkersSyncFns } from "./cloudflare-workers-fns";
import { TCloudflareWorkersSyncWithCredentials } from "./cloudflare-workers-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));
vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock("@app/lib/config/request", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  request: { get, patch }
}));

type TBinding = { type: string; name: string; text?: string; json?: unknown } & Record<string, unknown>;
type TVersion = { id: string; bindings: TBinding[] };
type TPatchBody = { env: Record<string, Omit<TBinding, "name"> | null>; annotations: Record<string, string> };

const cloudflareError = (code: number) =>
  new AxiosError("Request failed with status code 400", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 400,
    data: { success: false, errors: [{ code, message: `error ${code}` }] }
  } as AxiosResponse);

// Fake Cloudflare: a Worker's versions and the one deployed. The secrets and settings endpoints refuse to write while
// the latest version isn't the deployed one, and PATCH versions/latest merges `env` into a copy of the latest version,
// the way the live API does.
const worker = {
  versions: [] as TVersion[],
  deployedId: "",
  storeVersion: undefined as ((version: TVersion) => TVersion) | undefined
};

const latest = () => worker.versions[worker.versions.length - 1];
const uploadVersion = (bindings: TBinding[]) => {
  const version = { id: `v${worker.versions.length + 1}`, bindings };
  worker.versions.push(version);
  return version;
};
const isPending = () => latest().id !== worker.deployedId;

const installFakeCloudflare = () => {
  get.mockImplementation(async (url: string) => {
    if (url.endsWith("/secrets")) {
      return { data: { result: latest().bindings.filter(({ type }) => type === "secret_text") } };
    }
    if (url.endsWith("/settings")) return { data: { result: { bindings: latest().bindings } } };
    const ref = url.split("/versions/")[1];
    const version = ref === "latest" ? latest() : worker.versions.find(({ id }) => id === ref);
    return { data: { success: true, result: structuredClone(version) } };
  });

  patch.mockImplementation(async (url: string, body: unknown) => {
    if (url.endsWith("/secrets-bulk") || url.endsWith("/settings")) {
      if (isPending()) throw cloudflareError(url.endsWith("/settings") ? 10214 : 10215);
      return { data: { success: true } };
    }

    const bindings = new Map(latest().bindings.map((binding) => [binding.name, binding]));
    for (const [name, binding] of Object.entries((body as TPatchBody).env)) {
      if (binding === null) bindings.delete(name);
      else bindings.set(name, { ...binding, name } as TBinding);
    }
    const uploaded = uploadVersion([...bindings.values()]);
    if (worker.storeVersion) worker.versions[worker.versions.length - 1] = worker.storeVersion(uploaded);
    return { data: { success: true, result: { id: uploaded.id } } };
  });
};

const syncOf = (syncOptions: Record<string, unknown> = {}, variableType?: CloudflareWorkersVariableType) =>
  ({
    id: "sync-id",
    destination: "cloudflare-workers",
    destinationConfig: { scriptId: "my-worker", variableType: variableType ?? CloudflareWorkersVariableType.Secret },
    environment: { slug: "prod" },
    syncOptions: { disableSecretDeletion: false, ...syncOptions },
    connection: { credentials: { apiToken: "token", accountId: "account-id" } }
  }) as unknown as TCloudflareWorkersSyncWithCredentials;

const payloadOf = (secrets: Record<string, string>) =>
  ({
    flatten: () => Object.fromEntries(Object.entries(secrets).map(([key, value]) => [key, { value }]))
  }) as unknown as TSecretSyncPayload;

// Like Redlock: acquiring a held lock fails rather than waits.
const heldLocks = new Set<string>();
const keyStore = {
  acquireLock: async ([key]: string[]) => {
    if (heldLocks.has(key)) throw new Error("lock is held");
    heldLocks.add(key);
    return {
      release: async () => {
        heldLocks.delete(key);
      }
    };
  }
} as unknown as Pick<TKeyStoreFactory, "acquireLock">;

const sync = (secrets: Record<string, string>, target = syncOf()) =>
  CloudflareWorkersSyncFns.syncSecrets(target, payloadOf(secrets), { keyStore });

const versionPatches = () => patch.mock.calls.filter(([url]) => (url as string).endsWith("/versions/latest"));
const sentEnv = () => {
  expect(versionPatches()).toHaveLength(1);
  return (versionPatches()[0][1] as TPatchBody).env;
};

const INITIAL_BINDINGS: TBinding[] = [
  { type: "secret_text", name: "API_KEY" },
  { type: "secret_text", name: "STALE" },
  { type: "plain_text", name: "MODE", text: "prod" },
  { type: "kv_namespace", name: "CACHE", namespace_id: "ns" }
];

describe("Cloudflare Workers sync version fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    worker.versions = [];
    worker.storeVersion = undefined;
    heldLocks.clear();
    installFakeCloudflare();
    worker.deployedId = uploadVersion(INITIAL_BINDINGS).id;
    // A version uploaded without deploying it, as `wrangler versions upload` leaves one.
    uploadVersion(INITIAL_BINDINGS);
  });

  it("isn't used when the latest version is the deployed one", async () => {
    worker.deployedId = latest().id;

    expect(await sync({ API_KEY: "new" })).toBeUndefined();
    expect(versionPatches()).toHaveLength(0);
  });

  it("patches the latest version when the Worker has a pending version, and names the new one", async () => {
    const result = await sync({ API_KEY: "new", ADDED: "a" });

    expect(sentEnv()).toEqual({
      API_KEY: { type: "secret_text", text: "new" },
      ADDED: { type: "secret_text", text: "a" },
      STALE: null
    });
    expect((versionPatches()[0][1] as TPatchBody).annotations).toMatchObject({ "workers/tag": "infisical-sync" });
    expect(worker.deployedId).toBe("v1");
    expect(result).toEqual({
      createdSecretKeys: ["ADDED"],
      updatedSecretKeys: ["API_KEY"],
      deletedSecretKeys: ["STALE"],
      message:
        "Worker has undeployed changes; created version v3 with updated secrets. Deploy it for the secrets to take effect."
    });
  });

  it("is used when the settings endpoint refuses a text sync", async () => {
    await sync({ NEW_VAR: "v" }, syncOf({}, CloudflareWorkersVariableType.Text));

    expect(sentEnv()).toEqual({ NEW_VAR: { type: "plain_text", text: "v" }, MODE: null });
  });

  it("isn't used to remove secrets, which would stay live while the removal reported success", async () => {
    await expect(CloudflareWorkersSyncFns.removeSecrets(syncOf(), payloadOf({ API_KEY: "x" }))).rejects.toThrow(
      "latest Worker version is not deployed"
    );
    expect(versionPatches()).toHaveLength(0);
  });

  describe("planning the patch", () => {
    it("fails before patching when a secret has the name of a non-variable binding", async () => {
      await expect(sync({ CACHE: "value" })).rejects.toThrow("CACHE");
      expect(versionPatches()).toHaveLength(0);
    });

    it("fails before patching rather than change a variable's type", async () => {
      await expect(sync({ API_KEY: "new", MODE: "value" })).rejects.toThrow("MODE (text)");
      expect(versionPatches()).toHaveLength(0);
    });

    it.each([
      [false, { STALE: null }],
      [true, {}]
    ])(
      "deletes only secrets that exist on the latest version (disableSecretDeletion: %s)",
      async (disableSecretDeletion, deletions) => {
        await sync({ API_KEY: "new", NEVER_SYNCED: "x" }, syncOf({ disableSecretDeletion }));

        expect(sentEnv()).toEqual({
          API_KEY: { type: "secret_text", text: "new" },
          NEVER_SYNCED: { type: "secret_text", text: "x" },
          ...deletions
        });
      }
    );

    it("fails before patching a JSON sync on a value that isn't JSON", async () => {
      await expect(sync({ CONFIG: "not json" }, syncOf({}, CloudflareWorkersVariableType.Json))).rejects.toThrow(
        "not valid JSON"
      );
      expect(versionPatches()).toHaveLength(0);
    });

    it("updates a text variable as it is when the toggle is on", async () => {
      await sync({ API_KEY: "new", MODE: "staging" }, syncOf({ syncNonSecretBindings: true }));

      expect(sentEnv()).toMatchObject({ MODE: { type: "plain_text", text: "staging" } });
    });
  });

  describe("failures", () => {
    it("rejects a version whose bindings don't match the patch, and names the difference", async () => {
      worker.storeVersion = (version) => ({
        ...version,
        bindings: version.bindings.filter(({ name }) => name !== "CACHE")
      });

      const error = (await sync({ API_KEY: "s3cr3t-value" }).catch((err: unknown) => err)) as Error;

      expect(error).toBeInstanceOf(SecretSyncError);
      expect(error.message).toContain("missing CACHE (kv_namespace)");
      expect(error.message).not.toContain("s3cr3t-value");
    });

    it("lets the job retry when another sync holds the Worker's lock", async () => {
      heldLocks.add("cloudflare-worker-version-mutex-account-id-my-worker");

      const error = (await sync({ API_KEY: "new" }).catch((err: unknown) => err)) as SecretSyncError;

      expect(error).toBeInstanceOf(SecretSyncError);
      expect(error.shouldRetry).toBe(true);
      expect(versionPatches()).toHaveLength(0);
    });
  });
});
