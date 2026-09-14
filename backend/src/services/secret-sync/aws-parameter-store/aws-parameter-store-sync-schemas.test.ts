import { SecretSyncInitialSyncBehavior } from "@app/services/secret-sync/secret-sync-enums";

import {
  AwsParameterStoreSyncListItemSchema,
  AwsParameterStoreSyncOptionsSchema,
  AwsParameterStoreSyncSchema
} from "./aws-parameter-store-sync-schemas";

describe("AwsParameterStoreSyncListItemSchema", () => {
  test("advertises support for preserving secret paths", () => {
    const result = AwsParameterStoreSyncListItemSchema.safeParse({
      name: "AWS Parameter Store",
      connection: "aws",
      destination: "aws-parameter-store",
      canImportSecrets: true,
      canRemoveSecretsOnDeletion: true,
      supportsSecretPaths: true
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.supportsSecretPaths).toBe(true);
  });
});

describe("AwsParameterStoreSyncSchema syncOptions.preserveSecretPaths", () => {
  test("accepts preserveSecretPaths since AWS Parameter Store supports it", () => {
    const result = AwsParameterStoreSyncSchema.shape.syncOptions.safeParse({
      initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
      preserveSecretPaths: true
    });

    expect(result.success).toBe(true);
  });
});

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
