import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { SecretSyncInitialSyncBehavior } from "../secret-sync-enums";
import { AwsSecretsManagerSyncMappingBehavior } from "./aws-secrets-manager-sync-enums";
import {
  AwsSecretsManagerSyncOptionsSchema,
  CreateAwsSecretsManagerSyncSchema,
  UpdateAwsSecretsManagerSyncSchema
} from "./aws-secrets-manager-sync-schemas";

describe("AwsSecretsManagerSyncOptionsSchema", () => {
  test("accepts an empty tag value", () => {
    expect(AwsSecretsManagerSyncOptionsSchema.safeParse({ tags: [{ key: "environment", value: "" }] }).success).toBe(
      true
    );
  });

  test("preserves character validation for non-empty tag values", () => {
    expect(
      AwsSecretsManagerSyncOptionsSchema.safeParse({ tags: [{ key: "environment", value: "invalid%value" }] }).success
    ).toBe(false);
  });
});

describe("preserveFolderStructure", () => {
  const syncOptions = {
    initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
    includeAllSubFolders: true,
    preserveFolderStructure: true
  };

  const createSync = (destinationConfig: Record<string, unknown>) =>
    CreateAwsSecretsManagerSyncSchema.safeParse({
      name: "sync",
      projectId: "project",
      connectionId: "c9d6b6a2-3c1e-4c2c-9f1e-0d5f3c1c2b7a",
      environment: "dev",
      secretPath: "/backend",
      destinationConfig: { region: AWSRegion.US_EAST_1, ...destinationConfig },
      syncOptions
    });

  test("accepts preserving folder structure with one-to-one mapping", () => {
    expect(createSync({ mappingBehavior: AwsSecretsManagerSyncMappingBehavior.OneToOne }).success).toBe(true);
  });

  test("rejects preserving folder structure with many-to-one mapping", () => {
    expect(
      createSync({ mappingBehavior: AwsSecretsManagerSyncMappingBehavior.ManyToOne, secretName: "app" }).success
    ).toBe(false);
  });

  test("rejects an update that sends many-to-one mapping with preserving folder structure", () => {
    expect(
      UpdateAwsSecretsManagerSyncSchema.safeParse({
        destinationConfig: {
          region: AWSRegion.US_EAST_1,
          mappingBehavior: AwsSecretsManagerSyncMappingBehavior.ManyToOne,
          secretName: "app"
        },
        syncOptions
      }).success
    ).toBe(false);
  });
});
