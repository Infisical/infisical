import { AwsSecretsManagerSyncOptionsSchema } from "./aws-secrets-manager-sync-schemas";

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
