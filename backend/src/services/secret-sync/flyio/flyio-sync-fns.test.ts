import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@app/lib/config/request", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@app/lib/config/request")>();
  return {
    ...mod,
    createRequestClient: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn()
    }))
  };
});

vi.mock("@app/ee/services/audit-log/audit-log-dal", () => ({
  auditLogDAL: { create: vi.fn() }
}));

vi.mock("@app/services/secret/secret-queue", () => ({
  secretQueueService: { addSyncJob: vi.fn() }
}));

vi.mock("@app/services/secret-sync/secret-sync-queue", () => ({
  secretSyncQueue: { addJob: vi.fn() }
}));

vi.mock("@app/services/secret-sync/secret-sync-dal", () => ({
  secretSyncDAL: { findById: vi.fn(), updateById: vi.fn() }
}));

vi.mock("@app/services/secret/secret-dal", () => ({
  secretDAL: { find: vi.fn().mockResolvedValue([]) }
}));

vi.mock("@app/services/secret-v2-bridge/secret-v2-bridge-dal", () => ({
  secretV2BridgeDAL: { find: vi.fn().mockResolvedValue([]) }
}));

vi.mock("@app/services/folder/folder-dal", () => ({
  folderDAL: { findBySecretPath: vi.fn() }
}));

vi.mock("@app/services/folder-commit/folder-commit-service", () => ({
  folderCommitService: { commitFolderChanges: vi.fn() }
}));

vi.mock("@app/services/kms/kms-service", () => ({
  kmsService: {
    createCipherPairWithDataKey: vi.fn().mockResolvedValue({
      encryptor: vi.fn().mockReturnValue({ cipherTextBlob: Buffer.from("encrypted") }),
      decryptor: vi.fn().mockReturnValue(Buffer.from("decrypted"))
    })
  }
}));

vi.mock("@app/services/project-bot/project-bot-service", () => ({
  projectBotService: { getBotKey: vi.fn() }
}));

vi.mock("@app/services/secret/secret-fns", () => ({
  fnSecretBulkInsert: vi.fn(),
  fnSecretBulkUpdate: vi.fn(),
  fnSecretBulkDelete: vi.fn()
}));

import { FlyioSyncFns } from "./flyio-sync-fns";

const mockPost = vi.fn();
const mockGet = vi.fn();
vi.mock("@app/lib/config/request", () => ({
  createRequestClient: vi.fn(() => ({
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args)
  }))
}));

const baseSync = {
  id: "sync-1",
  app: "test-app",
  appId: "app-id-1",
  connection: { app: "test-app", credentials: { apiToken: "tok" } },
  environment: { slug: "dev" },
  secretPath: "/",
  projectId: "proj-1"
} as any;

const basePayload = { syncId: "sync-1", projectId: "proj-1" } as any;

describe("FlyioSyncFns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({
      data: { data: { app: { name: "test-app" } } }
    });
  });

  describe("syncSecrets - version handoff", () => {
    test("does not send min_secrets_version from GraphQL release", async () => {
      const machinesResponse = {
        data: { data: { app: { name: "test-app" } } }
      };

      mockPost
        .mockResolvedValueOnce({
          data: {
            data: {
              app: {
                currentRelease: { version: "3" },
                name: "test-app"
              }
            }
          }
        })
        .mockResolvedValueOnce({ data: { secrets: [], version: 4 } })
        .mockResolvedValueOnce({ data: { secrets: [], version: 4 } })
        .mockResolvedValueOnce({ data: {} });

      await FlyioSyncFns.syncSecrets(baseSync, basePayload);

      const deployCall = mockPost.mock.calls[3];
      expect(deployCall[1]).not.toHaveProperty("min_secrets_version");
    });

    test("passes returned secrets version to deploy call", async () => {
      mockPost
        .mockResolvedValueOnce({
          data: {
            data: {
              app: {
                currentRelease: { version: "3" },
                name: "test-app"
              }
            }
          }
        })
        .mockResolvedValueOnce({ data: { secrets: [], version: 7 } })
        .mockResolvedValueOnce({ data: { secrets: [], version: 7 } })
        .mockResolvedValueOnce({ data: {} });

      await FlyioSyncFns.syncSecrets(baseSync, basePayload);

      const deployCall = mockPost.mock.calls[3];
      expect(deployCall[1]).toHaveProperty("min_secrets_version", 7);
    });

    test("handles undefined secrets version gracefully", async () => {
      mockPost
        .mockResolvedValueOnce({
          data: {
            data: {
              app: {
                currentRelease: { version: "3" },
                name: "test-app"
              }
            }
          }
        })
        .mockResolvedValueOnce({ data: { secrets: [] } })
        .mockResolvedValueOnce({ data: { secrets: [] } })
        .mockResolvedValueOnce({ data: {} });

      await FlyioSyncFns.syncSecrets(baseSync, basePayload);

      const deployCall = mockPost.mock.calls[3];
      expect(deployCall[1]).toHaveProperty("min_secrets_version", 3);
    });

    test("handles missing currentRelease version", async () => {
      mockPost
        .mockResolvedValueOnce({
          data: {
            data: {
              app: {
                name: "test-app"
              }
            }
          }
        })
        .mockResolvedValueOnce({ data: { secrets: [], version: 5 } })
        .mockResolvedValueOnce({ data: { secrets: [], version: 5 } })
        .mockResolvedValueOnce({ data: {} });

      await FlyioSyncFns.syncSecrets(baseSync, basePayload);

      const deployCall = mockPost.mock.calls[3];
      expect(deployCall[1]).toHaveProperty("min_secrets_version", 5);
    });
  });

  describe("getAppNameByAppId", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test("throws SecretSyncError on GraphQL errors", async () => {
      mockPost.mockResolvedValueOnce({
        data: { data: null, errors: [{ message: "App not found" }] }
      });

      await expect(FlyioSyncFns.syncSecrets(baseSync, basePayload)).rejects.toThrow("App not found");
    });

    test("throws SecretSyncError when app is null", async () => {
      mockPost.mockResolvedValueOnce({
        data: { data: { app: null } }
      });

      await expect(FlyioSyncFns.syncSecrets(baseSync, basePayload)).rejects.toThrow("no app for id");
    });
  });
});
