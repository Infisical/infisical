import { beforeEach, describe, expect, it, vi } from "vitest";

import { TDigitalOceanApp } from "@app/services/app-connection/digital-ocean";

import { SecretSyncError } from "../secret-sync-errors";
import { TSecretSyncPayload } from "../secret-sync-payload";
import { DigitalOceanAppPlatformSyncFns } from "./digital-ocean-app-platform-sync-fns";
import { TDigitalOceanAppPlatformSyncWithCredentials } from "./digital-ocean-app-platform-sync-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@app/lib/config/request", () => ({ createRequestClient: () => ({ get, put }) }));

const sync = {
  destination: "digital-ocean-app-platform",
  destinationConfig: { appId: "app-id", appName: "my-app" },
  environment: { slug: "prod" },
  syncOptions: { disableSecretDeletion: false },
  connection: { method: "api-token", credentials: { apiToken: "token" } }
} as unknown as TDigitalOceanAppPlatformSyncWithCredentials;

const payloadOf = (keys: string[]) =>
  ({
    flatten: () => Object.fromEntries(keys.map((key) => [key, { value: `${key}-value` }]))
  }) as unknown as TSecretSyncPayload;

const appWith = (extra: Partial<TDigitalOceanApp> = {}): TDigitalOceanApp => ({
  id: "app-id",
  spec: {
    name: "my-app",
    services: [],
    envs: [
      { key: "MANAGED", value: "old", type: "SECRET" },
      { key: "UNMANAGED", value: "keep", type: "GENERAL" }
    ]
  },
  ...extra
});

const putEnvKeys = () => (put.mock.calls[0][1] as { spec: TDigitalOceanApp["spec"] }).spec.envs?.map((v) => v.key);

describe("DigitalOceanAppPlatformSyncFns", () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
    get.mockResolvedValue({ data: { app: appWith() } });
    put.mockResolvedValue({});
  });

  it("removeSecrets only removes the synced keys", async () => {
    await DigitalOceanAppPlatformSyncFns.removeSecrets(sync, payloadOf(["MANAGED"]));

    expect(put).toHaveBeenCalledTimes(1);
    expect(putEnvKeys()).toEqual(["UNMANAGED"]);
  });

  it.each([
    ["sync", "in progress", { in_progress_deployment: { id: "d1", phase: "BUILDING" } }],
    ["sync", "pending", { pending_deployment: { id: "d1" } }],
    ["remove", "in progress", { in_progress_deployment: { id: "d1", phase: "BUILDING" } }],
    ["remove", "pending", { pending_deployment: { id: "d1" } }]
  ])("%s fails with a retryable error when a deployment is %s", async (operation, _, extra) => {
    get.mockResolvedValue({ data: { app: appWith(extra) } });

    const payload = payloadOf(["MANAGED"]);
    const error = await (
      operation === "sync"
        ? DigitalOceanAppPlatformSyncFns.syncSecrets(sync, payload)
        : DigitalOceanAppPlatformSyncFns.removeSecrets(sync, payload)
    ).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(SecretSyncError);
    expect((error as SecretSyncError).shouldRetry).toBe(true);
    expect((error as SecretSyncError).message).toContain("deployment is in progress");
    expect(put).not.toHaveBeenCalled();
  });

  it("fails without retry when a key contains a hyphen", async () => {
    const error = await DigitalOceanAppPlatformSyncFns.syncSecrets(sync, payloadOf(["OK_KEY", "MY-KEY"])).catch(
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(SecretSyncError);
    expect((error as SecretSyncError).shouldRetry).toBe(false);
    expect((error as SecretSyncError).secretKey).toBe("MY-KEY");
    expect((error as SecretSyncError).message).toContain("MY-KEY");
    expect(get).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("syncSecrets writes secrets when no deployment is running", async () => {
    await DigitalOceanAppPlatformSyncFns.syncSecrets(sync, payloadOf(["MANAGED"]));

    expect(putEnvKeys()).toEqual(["MANAGED"]);
  });
});
