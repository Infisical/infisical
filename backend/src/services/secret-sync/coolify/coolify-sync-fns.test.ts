import { beforeEach, describe, expect, it, vi } from "vitest";

import { TSecretSyncPayload } from "../secret-sync-payload";
import { CoolifySyncFns } from "./coolify-sync-fns";
import { TCoolifySecret, TCoolifySyncWithCredentials } from "./coolify-sync-types";

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

const syncWith = (syncOptions: Record<string, unknown> = {}) =>
  ({
    destination: "coolify",
    destinationConfig: { appId: "app-uuid-1" },
    environment: { slug: "prod" },
    syncOptions: { disableSecretDeletion: false, ...syncOptions },
    connection: {
      credentials: {
        instanceUrl: "https://coolify.example.com",
        apiToken: "test-token"
      }
    }
  }) as unknown as TCoolifySyncWithCredentials;

const payloadOf = (secrets: Record<string, string> = { KEY_A: "val-a" }) =>
  ({
    flatten: () => Object.fromEntries(Object.entries(secrets).map(([k, v]) => [k, { value: v }]))
  }) as unknown as TSecretSyncPayload;

describe("CoolifySyncFns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("syncSecrets", () => {
    it("rejects invalid Coolify environment variable names before making API calls", async () => {
      await expect(
        CoolifySyncFns.syncSecrets(syncWith(), payloadOf({ "INVALID-NAME": "val", VALID_KEY: "val" }))
      ).rejects.toThrow("not a valid Coolify environment variable name: INVALID-NAME");

      expect(get).not.toHaveBeenCalled();
      expect(post).not.toHaveBeenCalled();
    });

    it("creates secrets that do not exist, and updates secrets that already exist", async () => {
      const existingSecrets: TCoolifySecret[] = [
        {
          id: 1,
          uuid: "secret-uuid-1",
          key: "EXISTING_KEY",
          value: "old-val",
          real_value: "old-val",
          is_literal: false,
          is_multiline: false,
          is_preview: false
        }
      ];

      get.mockResolvedValueOnce({ data: existingSecrets });

      await CoolifySyncFns.syncSecrets(
        syncWith(),
        payloadOf({ EXISTING_KEY: "new-val", NEW_KEY: "created-val" })
      );

      expect(patch).toHaveBeenCalledWith(
        "https://coolify.example.com/api/v1/applications/app-uuid-1/envs",
        {
          key: "EXISTING_KEY",
          value: "new-val",
          is_literal: false,
          is_preview: false
        },
        expect.anything()
      );

      expect(post).toHaveBeenCalledWith(
        "https://coolify.example.com/api/v1/applications/app-uuid-1/envs",
        {
          key: "NEW_KEY",
          value: "created-val",
          is_literal: false,
          is_preview: false
        },
        expect.anything()
      );
    });

    it("deletes stale secrets when disableSecretDeletion is false", async () => {
      const existingSecrets: TCoolifySecret[] = [
        {
          id: 1,
          uuid: "secret-uuid-1",
          key: "STALE_KEY",
          value: "val",
          real_value: "val",
          is_literal: false,
          is_multiline: false,
          is_preview: false
        }
      ];

      get.mockResolvedValueOnce({ data: existingSecrets });

      await CoolifySyncFns.syncSecrets(
        syncWith({ disableSecretDeletion: false }),
        payloadOf({ OTHER_KEY: "val" })
      );

      expect(del).toHaveBeenCalledWith(
        "https://coolify.example.com/api/v1/applications/app-uuid-1/envs/secret-uuid-1",
        expect.anything()
      );
    });

    it("does not delete stale secrets when disableSecretDeletion is true", async () => {
      const existingSecrets: TCoolifySecret[] = [
        {
          id: 1,
          uuid: "secret-uuid-1",
          key: "STALE_KEY",
          value: "val",
          real_value: "val",
          is_literal: false,
          is_multiline: false,
          is_preview: false
        }
      ];

      get.mockResolvedValueOnce({ data: existingSecrets });

      await CoolifySyncFns.syncSecrets(
        syncWith({ disableSecretDeletion: true }),
        payloadOf({ OTHER_KEY: "val" })
      );

      expect(del).not.toHaveBeenCalled();
    });

    it("does not delete secrets outside keySchema", async () => {
      const existingSecrets: TCoolifySecret[] = [
        {
          id: 1,
          uuid: "secret-uuid-1",
          key: "UNMANAGED_KEY",
          value: "val",
          real_value: "val",
          is_literal: false,
          is_multiline: false,
          is_preview: false
        }
      ];

      get.mockResolvedValueOnce({ data: existingSecrets });

      await CoolifySyncFns.syncSecrets(
        syncWith({ keySchema: "MANAGED_{{secretKey}}" }),
        payloadOf({ MANAGED_KEY: "val" })
      );

      expect(del).not.toHaveBeenCalled();
    });

    it("triggers application redeploy when autoRedeployServices is enabled", async () => {
      get.mockResolvedValueOnce({ data: [] });

      await CoolifySyncFns.syncSecrets(
        syncWith({ autoRedeployServices: true }),
        payloadOf({ NEW_KEY: "val" })
      );

      expect(post).toHaveBeenCalledWith(
        "https://coolify.example.com/api/v1/deploy",
        { uuid: "app-uuid-1" },
        expect.anything()
      );
    });

    it("does not trigger redeploy when autoRedeployServices is false", async () => {
      get.mockResolvedValueOnce({ data: [] });

      await CoolifySyncFns.syncSecrets(
        syncWith({ autoRedeployServices: false }),
        payloadOf({ NEW_KEY: "val" })
      );

      expect(post).not.toHaveBeenCalledWith(
        "https://coolify.example.com/api/v1/deploy",
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe("getSecrets", () => {
    it("returns mapped secrets from Coolify", async () => {
      const existingSecrets: TCoolifySecret[] = [
        {
          id: 1,
          uuid: "secret-uuid-1",
          key: "DB_URL",
          value: "hidden",
          real_value: "postgres://user:pass@host/db",
          is_literal: true,
          is_multiline: false,
          is_preview: false
        }
      ];

      get.mockResolvedValueOnce({ data: existingSecrets });

      const result = await CoolifySyncFns.getSecrets(syncWith());
      expect(result).toEqual({
        DB_URL: {
          value: "postgres://user:pass@host/db",
          skipMultilineEncoding: false,
          secretMetadata: [
            { key: "is_literal", value: "true" },
            { key: "is_preview", value: "false" }
          ]
        }
      });
    });
  });

  describe("removeSecrets", () => {
    it("deletes specified secrets and triggers redeploy if configured", async () => {
      const existingSecrets: TCoolifySecret[] = [
        {
          id: 1,
          uuid: "secret-uuid-1",
          key: "TARGET_SECRET",
          value: "val",
          real_value: "val",
          is_literal: false,
          is_multiline: false,
          is_preview: false
        }
      ];

      get.mockResolvedValueOnce({ data: existingSecrets });

      await CoolifySyncFns.removeSecrets(
        syncWith({ autoRedeployServices: true }),
        payloadOf({ TARGET_SECRET: "val" })
      );

      expect(del).toHaveBeenCalledWith(
        "https://coolify.example.com/api/v1/applications/app-uuid-1/envs/secret-uuid-1",
        expect.anything()
      );
      expect(post).toHaveBeenCalledWith(
        "https://coolify.example.com/api/v1/deploy",
        { uuid: "app-uuid-1" },
        expect.anything()
      );
    });
  });
});
