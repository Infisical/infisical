import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { DigitalOceanConnectionMethod } from "@app/services/app-connection/digital-ocean";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { DigitalOceanAppPlatformSyncFns } from "./digital-ocean-app-platform-sync-fns";
import { TDigitalOceanAppPlatformSyncWithCredentials } from "./digital-ocean-app-platform-sync-types";

const { mockGetVariables, mockPutVariables, mockDeleteVariables } = vi.hoisted(() => ({
  mockGetVariables: vi.fn(),
  mockPutVariables: vi.fn(),
  mockDeleteVariables: vi.fn()
}));

vi.mock("@app/services/app-connection/digital-ocean/digital-ocean-connection-public-client", () => ({
  DigitalOceanAppPlatformPublicAPI: {
    getVariables: mockGetVariables,
    putVariables: mockPutVariables,
    deleteVariables: mockDeleteVariables
  }
}));

describe("DigitalOceanAppPlatformSyncFns", () => {
  const mockSync = {
    id: "sync-123",
    name: "DO Sync",
    destination: SecretSync.DigitalOceanAppPlatform,
    connectionId: "conn-123",
    folderId: "folder-123",
    environmentId: "env-123",
    destinationConfig: {
      appId: "do-app-123",
      appName: "my-app"
    },
    syncOptions: {
      disableSecretDeletion: false,
      keySchema: undefined
    },
    environment: {
      slug: "dev"
    },
    connection: {
      id: "conn-123",
      orgId: "org-123",
      app: AppConnection.DigitalOcean,
      method: DigitalOceanConnectionMethod.ApiToken,
      credentials: {
        apiToken: "dop_v1_mock_token"
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  } as unknown as TDigitalOceanAppPlatformSyncWithCredentials;

  beforeEach(() => {
    mockGetVariables.mockReset();
    mockPutVariables.mockReset();
    mockDeleteVariables.mockReset();
  });

  describe("removeSecrets", () => {
    it("filters existing variables using their actual key matching secretMap and calls deleteVariables", async () => {
      const existingVariables = [
        { key: "SYNCED_SECRET", value: "val1", type: "SECRET" },
        { key: "ANOTHER_SECRET", value: "val2", type: "SECRET" },
        { key: "UNRELATED_VAR", value: "val3", type: "GENERAL" }
      ];

      mockGetVariables.mockResolvedValueOnce(existingVariables);
      mockDeleteVariables.mockResolvedValueOnce({});

      const secretMap: TSecretMap = {
        SYNCED_SECRET: { value: "val1" },
        ANOTHER_SECRET: { value: "val2" }
      };

      await DigitalOceanAppPlatformSyncFns.removeSecrets(mockSync, secretMap);

      expect(mockGetVariables).toHaveBeenCalledWith(mockSync.connection, "do-app-123");
      expect(mockDeleteVariables).toHaveBeenCalledWith(
        mockSync.connection,
        "do-app-123",
        { key: "SYNCED_SECRET", value: "val1", type: "SECRET" },
        { key: "ANOTHER_SECRET", value: "val2", type: "SECRET" }
      );
    });

    it("does not pass non-matching variables when secretMap has no matches", async () => {
      const existingVariables = [{ key: "UNRELATED_VAR", value: "val3", type: "GENERAL" }];

      mockGetVariables.mockResolvedValueOnce(existingVariables);
      mockDeleteVariables.mockResolvedValueOnce({});

      const secretMap: TSecretMap = {
        OTHER_KEY: { value: "val" }
      };

      await DigitalOceanAppPlatformSyncFns.removeSecrets(mockSync, secretMap);

      expect(mockDeleteVariables).toHaveBeenCalledWith(mockSync.connection, "do-app-123");
    });

    it("wraps API errors in SecretSyncError", async () => {
      mockGetVariables.mockRejectedValueOnce(new Error("Network failure"));

      await expect(
        DigitalOceanAppPlatformSyncFns.removeSecrets(mockSync, {
          SECRET: { value: "v" }
        })
      ).rejects.toThrow(SecretSyncError);
    });
  });

  describe("getSecrets", () => {
    it("throws unsupported error", async () => {
      await expect(DigitalOceanAppPlatformSyncFns.getSecrets(mockSync)).rejects.toThrow(
        "does not support importing secrets"
      );
    });
  });
});
