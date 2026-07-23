import { describe, expect, test } from "vitest";

import { ExternalKmsAwsSchema, KmsAwsCredentialType, SanitizedExternalKmsAwsSchema } from "./model";

describe("SanitizedExternalKmsAwsSchema (external-KMS read response)", () => {
  const awsAccessKeyInput = {
    credential: {
      type: KmsAwsCredentialType.AccessKey,
      data: {
        accessKey: "AKIAEXAMPLE",
        secretKey: "super-secret-value"
      }
    },
    awsRegion: "us-east-1",
    kmsKeyId: "key-123"
  };

  test("strips secretKey from an access-key credential on read", () => {
    const parsed = SanitizedExternalKmsAwsSchema.parse(awsAccessKeyInput);

    expect(parsed.credential.type).toBe(KmsAwsCredentialType.AccessKey);
    expect(parsed.credential.data).toHaveProperty("accessKey", "AKIAEXAMPLE");
    expect(parsed.credential.data).not.toHaveProperty("secretKey");
    // the secret value must not survive serialization anywhere in the response
    expect(JSON.stringify(parsed)).not.toContain("super-secret-value");
  });

  test("negative control: the pre-fix unsanitized schema would have returned secretKey", () => {
    const parsed = ExternalKmsAwsSchema.parse(awsAccessKeyInput);

    expect(parsed.credential.data).toHaveProperty("secretKey", "super-secret-value");
  });

  test("retains assume-role identifiers (that branch carries no secret material)", () => {
    const parsed = SanitizedExternalKmsAwsSchema.parse({
      credential: {
        type: KmsAwsCredentialType.AssumeRole,
        data: {
          assumeRoleArn: "arn:aws:iam::123456789012:role/infisical",
          externalId: "ext-1"
        }
      },
      awsRegion: "us-east-1"
    });

    expect(parsed.credential.data).toMatchObject({
      assumeRoleArn: "arn:aws:iam::123456789012:role/infisical",
      externalId: "ext-1"
    });
  });
});
