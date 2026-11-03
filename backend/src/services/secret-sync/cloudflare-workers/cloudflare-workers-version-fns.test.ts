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

const { get, patch, post } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn() }));
vi.mock("@app/lib/config/request", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  request: { get, patch, post }
}));

type TBinding = { type: string; name: string; text?: string; version_id?: string } & Record<string, unknown>;
type TVersion = { id: string; bindings: TBinding[] } & Record<string, unknown>;
type TCreateBody = { bindings: TBinding[] } & Record<string, unknown>;

const cloudflareError = (code: number) =>
  new AxiosError("Request failed with status code 400", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 400,
    data: { success: false, errors: [{ code, message: `error ${code}` }] }
  } as AxiosResponse);

// Shaped like a real read of a pending version: besides its configuration, Cloudflare returns fields that describe
// the version itself, and the bindings a second time as `env`.
const pendingVersion = (extra: Record<string, unknown> = {}): TVersion => ({
  id: "v21",
  number: 21,
  created_on: "2026-01-01T00:00:00Z",
  source: "wrangler",
  urls: ["https://my-worker.example.workers.dev"],
  env: { API_KEY: { type: "secret_text" } },
  main_module: "index.js",
  modules: [{ name: "index.js", content_type: "application/javascript+module", content_base64: "djIx" }],
  bindings: [
    { type: "secret_text", name: "API_KEY" },
    { type: "secret_text", name: "STALE" },
    { type: "kv_namespace", name: "CACHE", namespace_id: "ns" }
  ],
  compatibility_date: "2026-01-01",
  annotations: { "workers/triggered_by": "upload" },
  ...extra
});

let base: TVersion;
let created: Map<string, TVersion>;
let uploadGate: Promise<void> | undefined;
// Lets a test make Cloudflare store something other than what was uploaded.
let alterStoredVersion: ((version: TVersion) => TVersion) | undefined;

// The secrets endpoint refuses because v21 isn't deployed. Version reads and creates behave like Cloudflare's,
// including the two rejections seen against the live API.
const installFakeCloudflare = (secretsEndpointRefuses = true) => {
  get.mockImplementation(async (url: string) => {
    if (url.endsWith("/secrets")) {
      return { data: { result: base.bindings.filter(({ type }) => type === "secret_text") } };
    }
    if (url.endsWith("/settings")) return { data: { result: { bindings: base.bindings } } };
    const version = created.get(url.split("/versions/")[1]) ?? base;
    return { data: { success: true, result: structuredClone(version) } };
  });

  patch.mockImplementation(async () => {
    if (secretsEndpointRefuses) throw cloudflareError(10215);
    return { data: { success: true } };
  });

  post.mockImplementation(async (url: string, body: TCreateBody) => {
    if (body.env && body.bindings) throw cloudflareError(10021);
    if (body.bindings.some(({ type }) => type === "assets") && !body.assets) throw cloudflareError(10305);

    const bindings = body.bindings.map((binding) =>
      binding.type === "inherit" ? base.bindings.find(({ name }) => name === binding.name)! : binding
    );
    // Holds only the upload that is in flight when the gate is set.
    const gate = uploadGate;
    uploadGate = undefined;
    await gate;
    const uploaded = { ...body, id: `new-${created.size + 1}`, bindings };
    const version = alterStoredVersion ? alterStoredVersion(uploaded) : uploaded;
    created.set(version.id, version);
    base = version;
    return { data: { success: true, result: { id: version.id } } };
  });
};

const syncOf = (syncOptions: Record<string, unknown> = {}, id = "sync-id") =>
  ({
    id,
    destination: "cloudflare-workers",
    destinationConfig: { scriptId: "my-worker", variableType: CloudflareWorkersVariableType.Secret },
    environment: { slug: "prod" },
    syncOptions: { disableSecretDeletion: false, ...syncOptions },
    connection: { credentials: { apiToken: "token", accountId: "account-id" } }
  }) as unknown as TCloudflareWorkersSyncWithCredentials;
const secretSync = syncOf();

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

const payloadOf = (secrets: Record<string, string>) =>
  ({
    flatten: () => Object.fromEntries(Object.entries(secrets).map(([key, value]) => [key, { value }]))
  }) as unknown as TSecretSyncPayload;

const sync = (secrets: Record<string, string>, target = secretSync) =>
  CloudflareWorkersSyncFns.syncSecrets(target, payloadOf(secrets), { keyStore });

const versionCreates = () =>
  post.mock.calls.filter(([url]) => (url as string).endsWith("/versions")) as Array<
    [string, TCreateBody, { params?: unknown }]
  >;

describe("Cloudflare Workers version fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    base = pendingVersion();
    created = new Map();
    uploadGate = undefined;
    alterStoredVersion = undefined;
    heldLocks.clear();
  });

  it("doesn't create a version when the secrets endpoint succeeds", async () => {
    installFakeCloudflare(false);

    await sync({ API_KEY: "new" });

    expect(versionCreates()).toEqual([]);
  });

  it("adds the secrets to a new version built on the latest one, and never deploys it", async () => {
    installFakeCloudflare();

    const result = await sync({ API_KEY: "new", ADDED: "a" });

    const [[, body, config]] = versionCreates();
    expect(config.params).toEqual({ deploy: false });
    expect(Object.fromEntries(body.bindings.map((binding) => [binding.name, binding]))).toEqual({
      API_KEY: { type: "secret_text", name: "API_KEY", text: "new" },
      CACHE: { type: "inherit", name: "CACHE", version_id: "v21" },
      ADDED: { type: "secret_text", name: "ADDED", text: "a" }
    });
    expect(post.mock.calls.some(([url]) => (url as string).endsWith("/deployments"))).toBe(false);
    expect(result?.message).toContain("new-1");
  });

  it("sends back every field of the base version except its id and env", async () => {
    const extra = { tail_consumers: [{ service: "logger" }], exports: { Room: { type: "durable-object" } } };
    base = pendingVersion(extra);
    installFakeCloudflare();

    await sync({ API_KEY: "new" });

    const [[, body]] = versionCreates();
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("env");
    expect(body).toMatchObject({ number: 21, main_module: "index.js", modules: base.modules, ...extra });
  });

  it.each([
    ["assets", { assets: { config: { html_handling: "auto-trailing-slash" } } }],
    ["an assets binding", { bindings: [...pendingVersion().bindings, { type: "assets", name: "ASSETS" }] }]
  ])("refuses a Worker with %s, which a copy would lose", async (label, extra) => {
    base = pendingVersion(extra);
    installFakeCloudflare();

    await expect(sync({ API_KEY: "new" })).rejects.toThrow("static assets");
    expect(versionCreates()).toEqual([]);
  });

  it("fails a secret removal instead of leaving the secrets on the deployed Worker", async () => {
    installFakeCloudflare();

    await expect(CloudflareWorkersSyncFns.removeSecrets(secretSync, payloadOf({ API_KEY: "x" }))).rejects.toThrow(
      "deploy the latest Worker version"
    );
    expect(versionCreates()).toEqual([]);
  });

  it("explains a timed-out upload, and doesn't retry it", async () => {
    installFakeCloudflare();
    post.mockRejectedValueOnce(new AxiosError("timeout of 300000ms exceeded", "ECONNABORTED"));

    const error = (await sync({ API_KEY: "new" }).catch((err: unknown) => err)) as SecretSyncError;

    expect(error).toBeInstanceOf(SecretSyncError);
    expect(error.message).toContain("took longer than 5 minutes");
    expect(error.shouldRetry).toBe(false);
  });

  it("makes a second sync to the same Worker wait, so neither loses the other's changes", async () => {
    installFakeCloudflare();
    // Two different syncs, so only a lock on the Worker itself serializes them.
    const firstSync = syncOf({ disableSecretDeletion: true }, "first-sync");
    const secondSync = syncOf({ disableSecretDeletion: true }, "second-sync");
    let openUploadGate = () => {};
    uploadGate = new Promise((resolve) => {
      openUploadGate = resolve;
    });

    const first = sync({ API_KEY: "a" }, firstSync);
    try {
      await vi.waitFor(() => expect(versionCreates()).toHaveLength(1));

      // The first sync is mid-upload and holds the Worker's lock.
      const second = (await sync({ STALE: "b" }, secondSync).catch((err: unknown) => err)) as SecretSyncError;
      expect(second).toBeInstanceOf(SecretSyncError);
      expect(second.shouldRetry).toBe(true);
    } finally {
      openUploadGate();
    }
    await first;

    // The queue's retry builds on the first sync's version.
    await sync({ STALE: "b" }, secondSync);
    const latest = Object.fromEntries(base.bindings.map((binding) => [binding.name, binding]));
    expect(latest.API_KEY).toMatchObject({ text: "a" });
    expect(latest.STALE).toMatchObject({ text: "b" });
  });

  it("releases the Worker's lock when the fallback fails", async () => {
    base = pendingVersion({ assets: { config: {} } });
    installFakeCloudflare();

    await expect(sync({ API_KEY: "new" })).rejects.toThrow("static assets");
    expect(heldLocks.size).toBe(0);
  });

  it("fails, without exposing secret values, when the stored version doesn't match the upload", async () => {
    installFakeCloudflare();
    alterStoredVersion = (version) => ({
      ...version,
      bindings: version.bindings.filter(({ name }) => name !== "CACHE"),
      modules: [{ name: "index.js", content_type: "application/javascript+module", content_base64: "Y2hhbmdlZA==" }]
    });

    const error = (await sync({ API_KEY: "s3cr3t-value" }).catch((err: unknown) => err)) as Error;

    expect(error).toBeInstanceOf(SecretSyncError);
    expect(error.message).toContain("CACHE");
    expect(error.message).toContain("index.js");
    expect(error.message).not.toContain("s3cr3t-value");
  });
});
