import { describe, expect, test } from "vitest";

import { checkObjectStorageEnv, objectStorageEnvSchema } from "./env";

const parse = (env: Record<string, string | undefined>) =>
  objectStorageEnvSchema.superRefine(checkObjectStorageEnv).safeParse(env);

const messages = (result: ReturnType<typeof parse>) =>
  result.success ? [] : result.error.issues.map((issue) => issue.message);

describe("default storage env", () => {
  test("nothing set means the instance offers no default storage", () => {
    expect(parse({}).success).toBe(true);
  });

  test("a bucket and region, with or without keys, is complete", () => {
    expect(parse({ OBJECT_STORAGE_S3_BUCKET: "infisical-logs", OBJECT_STORAGE_S3_REGION: "us-east-1" }).success).toBe(
      true
    );
    expect(
      parse({
        OBJECT_STORAGE_S3_BUCKET: "infisical-logs",
        OBJECT_STORAGE_S3_REGION: "us-east-1",
        OBJECT_STORAGE_S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
        OBJECT_STORAGE_S3_SECRET_ACCESS_KEY: "secret"
      }).success
    ).toBe(true);
  });

  test.each([
    [{ OBJECT_STORAGE_S3_BUCKET: "infisical-logs" }, "OBJECT_STORAGE_S3_REGION must be set"],
    [{ OBJECT_STORAGE_S3_REGION: "us-east-1" }, "OBJECT_STORAGE_S3_BUCKET must be set"],
    [
      {
        OBJECT_STORAGE_S3_BUCKET: "infisical-logs",
        OBJECT_STORAGE_S3_REGION: "us-east-1",
        OBJECT_STORAGE_S3_ACCESS_KEY_ID: "AKIAEXAMPLE"
      },
      "OBJECT_STORAGE_S3_SECRET_ACCESS_KEY must be set"
    ],
    [
      {
        OBJECT_STORAGE_S3_BUCKET: "infisical-logs",
        OBJECT_STORAGE_S3_REGION: "us-east-1",
        OBJECT_STORAGE_S3_SECRET_ACCESS_KEY: "secret"
      },
      "OBJECT_STORAGE_S3_ACCESS_KEY_ID must be set"
    ]
  ])("a half-set group names what is missing", (env, expected) => {
    expect(messages(parse(env)).join(" ")).toContain(expected);
  });

  test.each(["il-central-1", "ap-southeast-7", "us-gov-west-1"])("accepts the region %s", (region) => {
    expect(parse({ OBJECT_STORAGE_S3_BUCKET: "infisical-logs", OBJECT_STORAGE_S3_REGION: region }).success).toBe(true);
  });

  test.each([
    { OBJECT_STORAGE_S3_BUCKET: "infisical-logs", OBJECT_STORAGE_S3_REGION: "US-EAST-1" },
    { OBJECT_STORAGE_S3_BUCKET: "Not_A_Bucket", OBJECT_STORAGE_S3_REGION: "us-east-1" },
    { OBJECT_STORAGE_S3_BUCKET: "logs--x-s3", OBJECT_STORAGE_S3_REGION: "us-east-1" },
    { OBJECT_STORAGE_S3_BUCKET: "infisical-logs", OBJECT_STORAGE_S3_REGION: "moon-1" },
    {
      OBJECT_STORAGE_S3_BUCKET: "infisical-logs",
      OBJECT_STORAGE_S3_REGION: "us-east-1",
      OBJECT_STORAGE_S3_PREFIX: "/a"
    }
  ])("refuses a value S3 would not accept", (env) => {
    expect(parse(env).success).toBe(false);
  });
});
