import { describe, expect, it } from "vitest";

import { AwsConnectionConfigurationSchema, AwsRoleArnInputSchema, CreateAwsConnectionSchema } from "./aws-connection-schemas";

describe("AwsRoleArnInputSchema", () => {
  it.each([
    "arn:aws:iam::123456789012:role/infisical",
    "arn:aws-us-gov:iam::123456789012:role/path/to/infisical-app-connection",
    "arn:aws-cn:iam::123456789012:role/a+b=c,d.e@f-g_h",
    "  arn:aws:iam::123456789012:role/infisical  "
  ])("accepts %s", (arn) => {
    expect(AwsRoleArnInputSchema.safeParse(arn).success).toBe(true);
  });

  it.each([
    "",
    "123456789012",
    "arn:aws:iam::12345:role/infisical",
    "arn:aws:iam::123456789012:user/infisical",
    "arn:aws:iam::123456789012:role/",
    "arn:aws:s3:::bucket",
    "arn:AWS:iam::123456789012:role/infisical"
  ])("rejects %j with a readable message", (arn) => {
    const result = AwsRoleArnInputSchema.safeParse(arn);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toMatch(/Role ARN/);
  });
});

describe("CreateAwsConnectionSchema", () => {
  const base = {
    name: "aws-conn",
    method: "assume-role",
    credentials: { roleArn: "arn:aws:iam::123456789012:role/infisical" }
  };

  it("accepts launch-stack provisioning metadata", () => {
    const result = CreateAwsConnectionSchema.safeParse({
      ...base,
      configuration: {
        provisioning: {
          launchMethod: "launch-stack",
          useCases: ["secrets-manager-sync"],
          stackName: "infisical-aws-app-connection-abc123",
          partition: "aws",
          templateVersion: "1"
        }
      }
    });
    expect(result.success).toBe(true);
  });

  it("accepts a connection without configuration", () => {
    expect(CreateAwsConnectionSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a malformed Role ARN on create", () => {
    const result = CreateAwsConnectionSchema.safeParse({ ...base, credentials: { roleArn: "not-an-arn" } });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid stack name and unknown launch method", () => {
    const bad = (provisioning: object) =>
      AwsConnectionConfigurationSchema.safeParse({
        provisioning: {
          launchMethod: "launch-stack",
          useCases: ["a"],
          stackName: "ok-name",
          partition: "aws",
          templateVersion: "1",
          ...provisioning
        }
      }).success;

    expect(bad({})).toBe(true);
    expect(bad({ stackName: "1bad name" })).toBe(false);
    expect(bad({ launchMethod: "manual" })).toBe(false);
    expect(bad({ useCases: [] })).toBe(false);
  });
});
