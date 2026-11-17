import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TerraformCloudConnectionMethod } from "@app/services/app-connection/terraform-cloud/terraform-cloud-connection-enums";

import { SecretSync, SecretSyncInitialSyncBehavior } from "../secret-sync-enums";
import { createSecretSyncPayload } from "../secret-sync-payload";
import { TerraformCloudSyncCategory, TerraformCloudSyncScope } from "./terraform-cloud-sync-enums";
import { TerraformCloudSyncFns } from "./terraform-cloud-sync-fns";
import { TTerraformCloudSyncWithCredentials } from "./terraform-cloud-sync-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { get, post, patch, deleteVariable } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  deleteVariable: vi.fn()
}));

vi.mock("@app/lib/config/request", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  request: { get, post, patch, delete: deleteVariable }
}));

const syncWith = (
  scope: TerraformCloudSyncScope,
  category: TerraformCloudSyncCategory
): TTerraformCloudSyncWithCredentials => ({
  id: "00000000-0000-4000-8000-000000000001",
  name: "Terraform sync",
  projectId: "project-id",
  connectionId: "00000000-0000-4000-8000-000000000002",
  destination: SecretSync.TerraformCloud,
  destinationConfig:
    scope === TerraformCloudSyncScope.Workspace
      ? { scope, org: "org", workspaceId: "workspace-id", workspaceName: "workspace", category }
      : { scope, org: "org", variableSetId: "variable-set-id", variableSetName: "variables", category },
  environment: { slug: "prod", name: "Production", id: "00000000-0000-4000-8000-000000000003" },
  folder: null,
  syncOptions: {
    disableSecretDeletion: false,
    initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination
  },
  connection: {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Terraform connection",
    app: AppConnection.TerraformCloud,
    method: TerraformCloudConnectionMethod.ApiToken,
    credentials: { apiToken: "api-token" },
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
});

const payload = () =>
  createSecretSyncPayload([{ key: "SHARED", path: "/", value: "updated" }], { environment: "prod" });

describe.each([TerraformCloudSyncScope.Workspace, TerraformCloudSyncScope.VariableSet])(
  "Terraform Cloud %s category reconciliation",
  (scope) => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it.each([TerraformCloudSyncCategory.Environment, TerraformCloudSyncCategory.Terraform])(
      "updates and deletes only variables in category %s",
      async (category) => {
        const otherCategory = category === TerraformCloudSyncCategory.Environment ? "terraform" : "env";
        get.mockResolvedValue({
          data: {
            data: [
              { id: "selected-shared", attributes: { key: "SHARED", value: "old", category } },
              { id: "selected-stale", attributes: { key: "STALE", value: "old", category } },
              { id: "other-shared", attributes: { key: "SHARED", value: "keep", category: otherCategory } },
              { id: "other-stale", attributes: { key: "STALE", value: "keep", category: otherCategory } }
            ]
          }
        });

        await TerraformCloudSyncFns.syncSecrets(syncWith(scope, category), payload());

        expect(patch).toHaveBeenCalledExactlyOnceWith(
          expect.stringMatching(/\/selected-shared$/),
          {
            data: { type: "vars", id: "selected-shared", attributes: { value: "updated", description: "", category } }
          },
          expect.any(Object)
        );
        expect(deleteVariable).toHaveBeenCalledExactlyOnceWith(
          expect.stringMatching(/\/selected-stale$/),
          expect.any(Object)
        );
        expect(post).not.toHaveBeenCalled();
      }
    );

    it("creates a variable when the same key exists only in another category", async () => {
      get.mockResolvedValue({
        data: { data: [{ id: "other-shared", attributes: { key: "SHARED", value: "keep", category: "terraform" } }] }
      });

      await TerraformCloudSyncFns.syncSecrets(syncWith(scope, TerraformCloudSyncCategory.Environment), payload());

      expect(post).toHaveBeenCalledExactlyOnceWith(
        expect.any(String),
        {
          data: {
            type: "vars",
            attributes: { key: "SHARED", value: "updated", description: "", category: "env", sensitive: true }
          }
        },
        expect.any(Object)
      );
      expect(patch).not.toHaveBeenCalled();
      expect(deleteVariable).not.toHaveBeenCalled();
    });

    it("removes matching keys only from the selected category", async () => {
      get.mockResolvedValue({
        data: {
          data: [
            { id: "selected-shared", attributes: { key: "SHARED", value: "old", category: "env" } },
            { id: "other-shared", attributes: { key: "SHARED", value: "keep", category: "terraform" } }
          ]
        }
      });

      await TerraformCloudSyncFns.removeSecrets(syncWith(scope, TerraformCloudSyncCategory.Environment), payload());

      expect(deleteVariable).toHaveBeenCalledExactlyOnceWith(
        expect.stringMatching(/\/selected-shared$/),
        expect.any(Object)
      );
    });
  }
);
