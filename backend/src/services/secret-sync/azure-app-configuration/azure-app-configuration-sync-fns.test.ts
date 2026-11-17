import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { AzureAppConfigurationConnectionMethod } from "@app/services/app-connection/azure-app-configuration/azure-app-configuration-connection-enums";

import { SecretSync, SecretSyncInitialSyncBehavior } from "../secret-sync-enums";
import { createSecretSyncPayload } from "../secret-sync-payload";
import { azureAppConfigurationSyncFactory } from "./azure-app-configuration-sync-fns";
import { TAzureAppConfigurationSyncWithCredentials } from "./azure-app-configuration-sync-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { get, put, deleteValue } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  deleteValue: vi.fn()
}));

vi.mock("@app/lib/config/request", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  request: { get, put, delete: deleteValue }
}));
vi.mock("@app/services/app-connection/azure-key-vault/azure-key-vault-connection-fns", () => ({
  getAzureConnectionAccessToken: vi.fn().mockResolvedValue({ accessToken: "access-token" })
}));

describe("Azure App Configuration sync label reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["prod", undefined])("preserves other labels when syncing label %s", async (label) => {
    let values = [
      { key: "DATABASE_URL", label, value: "current" },
      { key: "DATABASE_URL", label: "staging", value: "staging-current" },
      { key: "STALE", label, value: "remove" },
      { key: "STALE", label: "staging", value: "staging-stale" }
    ];

    get.mockImplementation(async (url: string) => {
      const selectedLabel = new URL(url, "https://example.azconfig.io").searchParams.get("label");
      return {
        data: {
          items: values.filter((value) => selectedLabel === null || (value.label ?? "\0") === selectedLabel)
        }
      };
    });
    deleteValue.mockImplementation(async (url: string, options: { params?: { label?: string } }) => {
      const key = new URL(url).pathname.split("/").pop();
      values = values.filter((value) => value.key !== key || value.label !== options.params?.label);
      return {};
    });

    const sync: TAzureAppConfigurationSyncWithCredentials = {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Azure sync",
      projectId: "project-id",
      connectionId: "00000000-0000-4000-8000-000000000002",
      destination: SecretSync.AzureAppConfiguration,
      destinationConfig: { configurationUrl: "https://example.azconfig.io", label },
      environment: { slug: "prod", name: "Production", id: "00000000-0000-4000-8000-000000000003" },
      folder: null,
      syncOptions: {
        disableSecretDeletion: false,
        initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination
      },
      connection: {
        id: "00000000-0000-4000-8000-000000000002",
        name: "Azure connection",
        app: AppConnection.AzureAppConfiguration,
        method: AzureAppConfigurationConnectionMethod.OAuth,
        credentials: { accessToken: "access-token", refreshToken: "refresh-token", expiresAt: 0 },
        orgId: "00000000-0000-4000-8000-000000000004",
        version: 1,
        isAutoRotationEnabled: false,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01")
      },
      version: 1,
      isAutoSyncEnabled: true,
      includeAllSubFolders: false,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01")
    };
    const provider = azureAppConfigurationSyncFactory({
      kmsService: { createCipherPairWithDataKey: vi.fn() },
      appConnectionDAL: { findById: vi.fn(), updateById: vi.fn() },
      oidcIssuerService: { signToken: vi.fn() }
    });

    await provider.syncSecrets(
      sync,
      createSecretSyncPayload([{ key: "DATABASE_URL", path: "/", value: "current" }], { environment: "prod" })
    );

    expect(values).toEqual([
      { key: "DATABASE_URL", label, value: "current" },
      { key: "DATABASE_URL", label: "staging", value: "staging-current" },
      { key: "STALE", label: "staging", value: "staging-stale" }
    ]);
    expect(put).not.toHaveBeenCalled();
  });
});
