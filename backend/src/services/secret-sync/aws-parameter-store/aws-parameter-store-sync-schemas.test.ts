import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { SecretSyncInitialSyncBehavior } from "../secret-sync-enums";
import {
  AwsParameterStoreSyncOptionsSchema,
  CreateAwsParameterStoreSyncSchema,
  UpdateAwsParameterStoreSyncSchema
} from "./aws-parameter-store-sync-schemas";

describe("AwsParameterStoreSyncOptionsSchema", () => {
  test("accepts an empty tag value", () => {
    expect(AwsParameterStoreSyncOptionsSchema.safeParse({ tags: [{ key: "environment", value: "" }] }).success).toBe(
      true
    );
  });

  test("preserves character validation for non-empty tag values", () => {
    expect(
      AwsParameterStoreSyncOptionsSchema.safeParse({ tags: [{ key: "environment", value: "invalid%value" }] }).success
    ).toBe(false);
  });
});

describe("preserveFolderStructure", () => {
  const createSync = (syncOptions: Record<string, unknown>) =>
    CreateAwsParameterStoreSyncSchema.safeParse({
      name: "sync",
      projectId: "project",
      connectionId: "c9d6b6a2-3c1e-4c2c-9f1e-0d5f3c1c2b7a",
      environment: "dev",
      secretPath: "/backend",
      includeAllSubFolders: true,
      destinationConfig: { region: AWSRegion.US_EAST_1, path: "/test/" },
      syncOptions: { initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination, ...syncOptions }
    });

  test("accepts preserving folder structure", () => {
    expect(createSync({ preserveFolderStructure: true }).success).toBe(true);
  });

  test("rejects a key schema containing a slash when preserving folder structure", () => {
    expect(createSync({ preserveFolderStructure: true, keySchema: "dev/{{secretKey}}" }).success).toBe(false);
  });

  test("still accepts a key schema containing a slash on a flattened sync", () => {
    expect(createSync({ keySchema: "dev/{{secretKey}}" }).success).toBe(true);
  });

  test("rejects an update that preserves folder structure with a key schema containing a slash", () => {
    expect(
      UpdateAwsParameterStoreSyncSchema.safeParse({
        syncOptions: {
          initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
          preserveFolderStructure: true,
          keySchema: "dev/{{secretKey}}"
        }
      }).success
    ).toBe(false);
  });
});
