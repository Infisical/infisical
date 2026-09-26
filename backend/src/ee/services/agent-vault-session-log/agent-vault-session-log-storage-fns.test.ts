import { S3Client } from "@aws-sdk/client-s3";
import { STSServiceException } from "@aws-sdk/client-sts";
import { describe, expect, test, vi } from "vitest";

import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";

import { buildSessionLogStorage, presignSessionLogPut } from "./agent-vault-session-log-storage-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
}));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnection: vi.fn(async (raw: unknown) => raw)
}));
vi.mock("@app/services/app-connection/aws/aws-connection-fns", () => ({
  getAwsConnectionConfig: vi.fn()
}));

describe("presignSessionLogPut", () => {
  const client = new S3Client({
    region: "us-east-1",
    credentials: { accessKeyId: "AKIAEXAMPLE", secretAccessKey: "example-secret" }
  });

  test("signs the length and a create-only condition, so neither can be dropped or changed", async () => {
    const url = new URL(
      await presignSessionLogPut(client, { bucket: "my-bucket", objectKey: "logs/a.json.enc", ciphertextBytes: 42 })
    );
    const signed = (url.searchParams.get("X-Amz-SignedHeaders") ?? "").split(";");
    expect(signed).toContain("content-length");
    expect(signed).toContain("if-none-match");
  });
});

describe("buildSessionLogStorage", () => {
  const config = { appConnectionId: "conn-1", bucket: "logs", region: AWSRegion.US_EAST_1, keyPrefix: null };
  const deps = {
    appConnectionDAL: {
      findById: vi.fn(async () => ({ id: "conn-1", name: "prod-logs", orgId: "org-1", app: AppConnection.AWS }))
    },
    kmsService: {}
  } as unknown as Parameters<typeof buildSessionLogStorage>[2];

  test("says which connection could not be used and what AWS said", async () => {
    vi.mocked(getAwsConnectionConfig).mockRejectedValueOnce(
      new STSServiceException({
        name: "AccessDenied",
        $fault: "client",
        $metadata: { httpStatusCode: 403 },
        message: "User is not authorized to perform: sts:AssumeRole"
      })
    );
    await expect(buildSessionLogStorage(config, "org-1", deps)).rejects.toMatchObject({
      name: "BadRequest",
      message:
        "Couldn't use the AWS connection 'prod-logs' for session logs: User is not authorized to perform: sts:AssumeRole"
    });
  });

  test("keeps anything that is not from AWS out of the message", async () => {
    vi.mocked(getAwsConnectionConfig).mockRejectedValueOnce(new Error("kms_keys row missing"));
    await expect(buildSessionLogStorage(config, "org-1", deps)).rejects.toMatchObject({
      message: "Couldn't use the AWS connection 'prod-logs' for session logs: Infisical could not load its credentials"
    });
  });
});
