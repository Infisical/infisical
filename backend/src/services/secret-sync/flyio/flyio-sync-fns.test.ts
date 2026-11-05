import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockPost, mockGet } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockGet: vi.fn()
}));

vi.mock("@app/lib/config/request", () => ({
  request: { post: mockPost, get: mockGet }
}));

vi.mock("@app/services/secret-sync/secret-sync-fns", () => ({
  matchesSchema: vi.fn().mockReturnValue(true)
}));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({})
}));

import { FlyioSyncFns } from "./flyio-sync-fns";

const graphqlAppResponse = {
  data: { data: { app: { name: "test-app" } } }
};

const machineListResponse = {
  data: [
    {
      id: "machine-1",
      state: "started",
      region: "iad",
      config: { image: "app:latest" }
    }
  ]
};

// flatten() returns Record<string, { value: string }>
const basePayload = {
  flatten: () => ({
    API_KEY: { value: "sk-123" },
    DB_URL: { value: "postgres://db" }
  })
} as any;

const baseSync = {
  connection: { credentials: { accessToken: "tok" } },
  environment: { slug: "dev" },
  destinationConfig: { appId: "app-id-1" },
  syncOptions: {
    disableSecretDeletion: false,
    autoRedeploy: false,
    keySchema: ""
  },
  destination: "flyio"
} as any;

describe("FlyioSyncFns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("syncSecrets - version handoff", () => {
    it("uses Machines API version for min_secrets_version in deploy", async () => {
      const sync = {
        ...baseSync,
        syncOptions: { ...baseSync.syncOptions, autoRedeploy: true }
      };

      // 1. getAppNameByAppId (GraphQL)
      mockPost.mockResolvedValueOnce(graphqlAppResponse);
      // 2. putFlyioSecrets (Machines API) returns version 7
      mockPost.mockResolvedValueOnce({
        data: { secrets: [{ name: "API_KEY" }], version: 7 }
      });
      // 3. listFlyioSecrets (GraphQL)
      mockPost.mockResolvedValueOnce({
        data: {
          data: {
            app: { secrets: [{ name: "OLD_KEY", createdAt: "2024-01-01" }] }
          }
        }
      });
      // 4. deleteFlyioSecrets (Machines API) returns version 8
      mockPost.mockResolvedValueOnce({
        data: { secrets: [], version: 8 }
      });
      // 5. listAllMachines (GET)
      mockGet.mockResolvedValueOnce(machineListResponse);
      // 6. update machine (POST)
      mockPost.mockResolvedValueOnce({ data: {} });
      // 7. wait for machine (GET)
      mockGet.mockResolvedValueOnce({ data: {} });

      await FlyioSyncFns.syncSecrets(sync, basePayload);

      // The machine update call should use version 8 (delete overrides put)
      const deployCall = mockPost.mock.calls[4];
      expect(deployCall[1]).toHaveProperty("min_secrets_version", 8);
    });

    it("passes put version to deploy when deletion is disabled", async () => {
      const sync = {
        ...baseSync,
        syncOptions: {
          disableSecretDeletion: true,
          autoRedeploy: true,
          keySchema: ""
        }
      };

      // 1. getAppNameByAppId
      mockPost.mockResolvedValueOnce(graphqlAppResponse);
      // 2. putFlyioSecrets returns version 5
      mockPost.mockResolvedValueOnce({
        data: { secrets: [{ name: "API_KEY" }], version: 5 }
      });
      // 3. listAllMachines
      mockGet.mockResolvedValueOnce(machineListResponse);
      // 4. update machine
      mockPost.mockResolvedValueOnce({ data: {} });
      // 5. wait
      mockGet.mockResolvedValueOnce({ data: {} });

      await FlyioSyncFns.syncSecrets(sync, basePayload);

      const deployCall = mockPost.mock.calls[2];
      expect(deployCall[1]).toHaveProperty("min_secrets_version", 5);
    });

    it("omits min_secrets_version when put returns no version", async () => {
      const sync = {
        ...baseSync,
        syncOptions: {
          disableSecretDeletion: true,
          autoRedeploy: true,
          keySchema: ""
        }
      };

      // 1. getAppNameByAppId
      mockPost.mockResolvedValueOnce(graphqlAppResponse);
      // 2. putFlyioSecrets returns no version
      mockPost.mockResolvedValueOnce({
        data: { secrets: [] }
      });
      // 3. listAllMachines
      mockGet.mockResolvedValueOnce(machineListResponse);
      // 4. update machine
      mockPost.mockResolvedValueOnce({ data: {} });
      // 5. wait
      mockGet.mockResolvedValueOnce({ data: {} });

      await FlyioSyncFns.syncSecrets(sync, basePayload);

      const deployCall = mockPost.mock.calls[2];
      expect(deployCall[1]).not.toHaveProperty("min_secrets_version");
    });

    it("does not call deploy when autoRedeploy is false", async () => {
      // 1. getAppNameByAppId
      mockPost.mockResolvedValueOnce(graphqlAppResponse);
      // 2. putFlyioSecrets
      mockPost.mockResolvedValueOnce({
        data: { secrets: [{ name: "API_KEY" }], version: 3 }
      });
      // 3. listFlyioSecrets
      mockPost.mockResolvedValueOnce({
        data: {
          data: {
            app: { secrets: [{ name: "OLD_KEY", createdAt: "2024-01-01" }] }
          }
        }
      });
      // 4. deleteFlyioSecrets
      mockPost.mockResolvedValueOnce({
        data: { secrets: [], version: 4 }
      });

      await FlyioSyncFns.syncSecrets(baseSync, basePayload);

      // No GET calls should have been made (no machine listing)
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  describe("getAppNameByAppId", () => {
    it("throws SecretSyncError on GraphQL errors", async () => {
      mockPost.mockResolvedValueOnce({
        data: { data: null, errors: [{ message: "App not found" }] }
      });

      await expect(
        FlyioSyncFns.syncSecrets(baseSync, basePayload)
      ).rejects.toThrow("App not found");
    });

    it("throws SecretSyncError when app is null", async () => {
      mockPost.mockResolvedValueOnce({
        data: { data: { app: null } }
      });

      await expect(
        FlyioSyncFns.syncSecrets(baseSync, basePayload)
      ).rejects.toThrow("no app for id");
    });
  });

  describe("putFlyioSecrets - prototype pollution", () => {
    it("stores __proto__ as an own property in the values map", async () => {
      // Build a secretMap where __proto__ is a real own property (not the prototype).
      // This simulates a secret literally named "__proto__" coming from flatten().
      const secretMap = Object.create(null);
      secretMap["__proto__"] = { value: "malicious" };
      secretMap["NORMAL_KEY"] = { value: "value" };

      const payload = { flatten: () => secretMap } as any;

      const sync = {
        ...baseSync,
        syncOptions: {
          disableSecretDeletion: true,
          autoRedeploy: false,
          keySchema: ""
        }
      };

      // 1. getAppNameByAppId
      mockPost.mockResolvedValueOnce(graphqlAppResponse);
      // 2. putFlyioSecrets
      mockPost.mockResolvedValueOnce({
        data: { secrets: [], version: 1 }
      });

      await FlyioSyncFns.syncSecrets(sync, payload);

      // Verify the values map sent to Machines API has __proto__ as own property
      const putCall = mockPost.mock.calls[1];
      const valuesMap = putCall[1].values;
      expect(
        Object.prototype.hasOwnProperty.call(valuesMap, "__proto__")
      ).toBe(true);
      expect(Object.getPrototypeOf(valuesMap)).toBeNull();
      expect(valuesMap["__proto__"]).toBe("malicious");
    });
  });
});
