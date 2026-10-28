import { beforeEach, describe, expect, it, vi } from "vitest";

import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";

import { FlyioSyncFns } from "./flyio-sync-fns";
import { TFlyioSyncWithCredentials } from "./flyio-sync-types";

vi.mock("pkcs11js", () => ({}));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@app/lib/config/request", () => ({ request: { get, post } }));
vi.mock("@app/services/secret-sync/secret-sync-fns", () => ({
  matchesSchema: vi.fn((secret: string) => secret === "OBSOLETE_KEY" || secret === "EXISTING_KEY")
}));

const sync = {
  destination: SecretSync.Flyio,
  destinationConfig: { appId: "my-app-id" },
  environment: { slug: "prod" },
  syncOptions: { disableSecretDeletion: false, autoRedeploy: true },
  connection: { credentials: { accessToken: "test-token" } }
} as unknown as TFlyioSyncWithCredentials;

const payloadOf = (entries: Record<string, string>) =>
  ({
    flatten: () => Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, { value: v }]))
  }) as unknown as TSecretSyncPayload;

describe("FlyioSyncFns", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  describe("syncSecrets", () => {
    it("updates secrets via Machines API and redeploys machines with min_secrets_version", async () => {
      post.mockImplementation(async (url: string, body: any) => {
        if (url.includes("api.fly.io/graphql")) {
          if (body?.query?.includes("GetAppName")) {
            return { data: { data: { app: { name: "resolved-app-name" } } } };
          }
          if (body?.query?.includes("GetAppSecrets")) {
            return {
              data: {
                data: {
                  app: {
                    secrets: [{ name: "EXISTING_KEY" }, { name: "OBSOLETE_KEY" }]
                  }
                }
              }
            };
          }
        }
        if (url.includes("/apps/resolved-app-name/secrets")) {
          return { data: { version: 42, secrets: [] } };
        }
        if (url.includes("/apps/resolved-app-name/machines/m1")) {
          return { data: { id: "m1" } };
        }
        return { data: {} };
      });

      get.mockImplementation(async (url: string) => {
        if (url.endsWith("/apps/resolved-app-name/machines")) {
          return {
            data: [
              { id: "m1", state: "started", region: "iad", config: { env: {} } },
              { id: "m2", state: "destroyed", region: "iad", config: { env: {} } }
            ]
          };
        }
        if (url.includes("/wait?state=started")) {
          return { data: { state: "started" } };
        }
        return { data: {} };
      });

      await FlyioSyncFns.syncSecrets(sync, payloadOf({ NEW_KEY: "secret-val", EXISTING_KEY: "new-val" }));

      // Verify Machines API POST /apps/{appName}/secrets was called with new keys and null for deletion
      const secretsPostCall = post.mock.calls.find(([url]) => url.includes("/apps/resolved-app-name/secrets"));
      expect(secretsPostCall).toBeDefined();
      expect(secretsPostCall![1]).toEqual({
        values: {
          NEW_KEY: "secret-val",
          EXISTING_KEY: "new-val",
          OBSOLETE_KEY: null
        }
      });

      // Verify machine m1 was updated with min_secrets_version = 42
      const machinePostCall = post.mock.calls.find(([url]) => url.includes("/machines/m1"));
      expect(machinePostCall).toBeDefined();
      expect(machinePostCall![1]).toMatchObject({
        min_secrets_version: 42,
        region: "iad",
        skip_launch: false
      });

      // Destroyed machine m2 was skipped
      const machine2PostCall = post.mock.calls.find(([url]) => url.includes("/machines/m2"));
      expect(machine2PostCall).toBeUndefined();
    });

    it("does not delete secrets when disableSecretDeletion is true", async () => {
      const syncNoDeletion = {
        ...sync,
        syncOptions: { disableSecretDeletion: true, autoRedeploy: false }
      } as unknown as TFlyioSyncWithCredentials;

      post.mockImplementation(async (url: string, body: any) => {
        if (url.includes("api.fly.io/graphql") && body?.query?.includes("GetAppName")) {
          return { data: { data: { app: { name: "my-app" } } } };
        }
        if (url.includes("/apps/my-app/secrets")) {
          return { data: { version: 7, secrets: [] } };
        }
        return { data: {} };
      });

      await FlyioSyncFns.syncSecrets(syncNoDeletion, payloadOf({ KEY: "val" }));

      const secretsPostCall = post.mock.calls.find(([url]) => url.includes("/apps/my-app/secrets"));
      expect(secretsPostCall).toBeDefined();
      expect(secretsPostCall![1]).toEqual({
        values: {
          KEY: "val"
        }
      });
      // GetAppSecrets should not be called
      const graphqlCalls = post.mock.calls.filter(([url]) => url.includes("api.fly.io/graphql"));
      expect(graphqlCalls.some(([, b]: [string, any]) => b?.query?.includes("GetAppSecrets"))).toBe(false);
    });

    it("wraps Machines API errors in SecretSyncError", async () => {
      post.mockImplementation(async (url: string, body: any) => {
        if (url.includes("api.fly.io/graphql") && body?.query?.includes("GetAppName")) {
          return { data: { data: { app: { name: "my-app" } } } };
        }
        if (url.includes("/apps/my-app/secrets")) {
          throw new Error("Fly Machines API internal error");
        }
        return { data: { data: { app: { secrets: [] } } } };
      });

      await expect(FlyioSyncFns.syncSecrets(sync, payloadOf({ KEY: "val" }))).rejects.toThrow(SecretSyncError);
    });
  });

  describe("removeSecrets", () => {
    it("deletes specified secrets via Machines API and auto-redeploys", async () => {
      post.mockImplementation(async (url: string, body: any) => {
        if (url.includes("api.fly.io/graphql")) {
          if (body?.query?.includes("GetAppName")) {
            return { data: { data: { app: { name: "resolved-app" } } } };
          }
          if (body?.query?.includes("GetAppSecrets")) {
            return {
              data: {
                data: {
                  app: {
                    secrets: [{ name: "KEY_A" }, { name: "KEY_B" }]
                  }
                }
              }
            };
          }
        }
        if (url.includes("/apps/resolved-app/secrets")) {
          return { data: { version: 10, secrets: [] } };
        }
        if (url.includes("/machines/m1")) {
          return { data: { id: "m1" } };
        }
        return { data: {} };
      });

      get.mockImplementation(async (url: string) => {
        if (url.endsWith("/apps/resolved-app/machines")) {
          return {
            data: [{ id: "m1", state: "started", region: "iad", config: { env: {} } }]
          };
        }
        if (url.includes("/wait?state=started")) {
          return { data: { state: "started" } };
        }
        return { data: {} };
      });

      await FlyioSyncFns.removeSecrets(sync, payloadOf({ KEY_A: "val" }));

      const secretsPostCall = post.mock.calls.find(([url]) => url.includes("/apps/resolved-app/secrets"));
      expect(secretsPostCall).toBeDefined();
      expect(secretsPostCall![1]).toEqual({
        values: {
          KEY_A: null
        }
      });

      const machinePostCall = post.mock.calls.find(([url]) => url.includes("/machines/m1"));
      expect(machinePostCall).toBeDefined();
      expect(machinePostCall![1]).toMatchObject({
        min_secrets_version: 10
      });
    });
  });

  describe("getSecrets", () => {
    it("throws not supported error", async () => {
      await expect(FlyioSyncFns.getSecrets(sync)).rejects.toThrow(
        "Fly.io does not support importing secrets."
      );
    });
  });
});
