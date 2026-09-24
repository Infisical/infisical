import { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, test } from "vitest";

import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import {
  buildActivityObjectKey,
  normalizeKeyPrefix,
  presignActivityPut,
  resolveStorageConfig
} from "./agent-vault-activity-storage";

describe("normalizeKeyPrefix", () => {
  test.each([
    { input: undefined, expected: "", why: "unset" },
    { input: null, expected: "", why: "null" },
    { input: "", expected: "", why: "empty" },
    { input: "   ", expected: "", why: "whitespace only" },
    { input: "logs", expected: "logs/", why: "a trailing slash is added" },
    { input: "logs/", expected: "logs/", why: "an existing trailing slash is not doubled" },
    { input: "/logs", expected: "logs/", why: "a leading slash is dropped" },
    { input: "/logs///", expected: "logs/", why: "repeated slashes on both ends" },
    { input: "a/b/c", expected: "a/b/c/", why: "interior slashes are left alone" }
  ])("$why", ({ input, expected }) => {
    expect(normalizeKeyPrefix(input)).toBe(expected);
  });
});

describe("buildActivityObjectKey", () => {
  const base = {
    projectId: "proj-1",
    sessionId: "sess-1",
    proxyId: "proxy-1",
    startedAt: new Date("2026-09-16T10:31:04.221Z"),
    chunkId: "01K5ABCDEFGHJKMNPQRSTVWXYZ"
  };

  test("lays out prefix, project, session, proxy, date and chunk", () => {
    expect(buildActivityObjectKey({ ...base, keyPrefix: "logs" })).toBe(
      "logs/proj-1/sess-1/proxy-1/2026-09-16/01K5ABCDEFGHJKMNPQRSTVWXYZ.json.enc"
    );
  });

  test("omits the prefix segment entirely when there is no prefix", () => {
    expect(buildActivityObjectKey({ ...base, keyPrefix: null })).toBe(
      "proj-1/sess-1/proxy-1/2026-09-16/01K5ABCDEFGHJKMNPQRSTVWXYZ.json.enc"
    );
  });

  test("dates by UTC, so a chunk near midnight does not land in the reader's day", () => {
    const key = buildActivityObjectKey({ ...base, startedAt: new Date("2026-09-16T23:59:59.999Z") });
    expect(key).toContain("/2026-09-16/");
  });
});

describe("resolveStorageConfig", () => {
  const complete = {
    appConnectionId: "conn-1",
    bucket: "my-bucket",
    region: AWSRegion.US_EAST_1 as string,
    keyPrefix: "logs"
  };

  test("returns the coordinates when every required field is set", () => {
    expect(resolveStorageConfig(complete)).toEqual({
      appConnectionId: "conn-1",
      bucket: "my-bucket",
      region: AWSRegion.US_EAST_1,
      keyPrefix: "logs"
    });
  });

  test("treats a missing keyPrefix as null rather than incomplete", () => {
    expect(resolveStorageConfig({ ...complete, keyPrefix: null })?.keyPrefix).toBeNull();
  });

  test.each(["appConnectionId", "bucket", "region"] as const)("is null when %s is missing", (field) => {
    expect(resolveStorageConfig({ ...complete, [field]: null })).toBeNull();
  });
});

describe("presignActivityPut", () => {
  // Signing is local, so dummy credentials are enough and nothing leaves the process.
  const client = new S3Client({
    region: "us-east-1",
    credentials: { accessKeyId: "AKIAEXAMPLE", secretAccessKey: "example-secret" }
  });

  test("signs the length and a create-only condition, so neither can be dropped or changed", async () => {
    const url = new URL(
      await presignActivityPut(client, { bucket: "my-bucket", objectKey: "logs/a.json.enc", ciphertextBytes: 42 })
    );
    const signed = (url.searchParams.get("X-Amz-SignedHeaders") ?? "").split(";");
    expect(signed).toContain("content-length");
    expect(signed).toContain("if-none-match");
  });
});
