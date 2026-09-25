import { S3Client } from "@aws-sdk/client-s3";
import { STSServiceException } from "@aws-sdk/client-sts";
import { describe, expect, test, vi } from "vitest";

import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";

import {
  buildActivityObjectKey,
  buildActivityStorage,
  presignActivityPut,
  resolveStorageConfig
} from "./agent-vault-activity-storage";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
}));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnection: vi.fn(async (raw: unknown) => raw)
}));
vi.mock("@app/services/app-connection/aws/aws-connection-fns", () => ({
  getAwsConnectionConfig: vi.fn()
}));

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

describe("buildActivityStorage", () => {
  const config = { appConnectionId: "conn-1", bucket: "logs", region: AWSRegion.US_EAST_1, keyPrefix: null };
  const deps = {
    appConnectionDAL: {
      findById: vi.fn(async () => ({ id: "conn-1", name: "prod-logs", orgId: "org-1", app: AppConnection.AWS }))
    },
    kmsService: {}
  } as unknown as Parameters<typeof buildActivityStorage>[2];

  test("says which connection could not be used and what AWS said", async () => {
    vi.mocked(getAwsConnectionConfig).mockRejectedValueOnce(
      new STSServiceException({
        name: "AccessDenied",
        $fault: "client",
        $metadata: { httpStatusCode: 403 },
        message: "User is not authorized to perform: sts:AssumeRole"
      })
    );
    await expect(buildActivityStorage(config, "org-1", deps)).rejects.toMatchObject({
      name: "BadRequest",
      message:
        "Couldn't use the AWS connection 'prod-logs' for session logging: User is not authorized to perform: sts:AssumeRole"
    });
  });

  test("keeps anything that is not from AWS out of the message", async () => {
    vi.mocked(getAwsConnectionConfig).mockRejectedValueOnce(new Error("kms_keys row missing"));
    await expect(buildActivityStorage(config, "org-1", deps)).rejects.toMatchObject({
      message:
        "Couldn't use the AWS connection 'prod-logs' for session logging: Infisical could not load its credentials"
    });
  });
});
