import { AwsParameterStoreSyncOptionsSchema } from "./aws-parameter-store-sync-schemas";

describe("AwsParameterStoreSyncOptionsSchema", () => {
  test("accepts an empty tag value", () => {
    expect(
      AwsParameterStoreSyncOptionsSchema.safeParse({ tags: [{ key: "environment", value: "" }] }).success
    ).toBe(true);
  });

  test("preserves character validation for non-empty tag values", () => {
    expect(
      AwsParameterStoreSyncOptionsSchema.safeParse({ tags: [{ key: "environment", value: "invalid%value" }] })
        .success
    ).toBe(false);
  });
});
