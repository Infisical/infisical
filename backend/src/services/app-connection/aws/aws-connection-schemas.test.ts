import { describe, expect, it } from "vitest";

import {
  AwsConnectionConfigurationSchema,
  AwsRoleArnInputSchema,
  CreateAwsConnectionSchema,
  UpdateAwsConnectionSchema
} from "./aws-connection-schemas";

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

describe("AwsConnectionConfigurationSchema provisioning region and role name", () => {
  const parse = (provisioning: object) =>
    AwsConnectionConfigurationSchema.safeParse({
      provisioning: {
        launchMethod: "launch-stack",
        useCases: ["secrets-manager"],
        stackName: "infisical-aws-app-connection-abc123",
        partition: "aws",
        templateVersion: "1",
        ...provisioning
      }
    });

  it("keeps the region and role name it is given", () => {
    const result = parse({ region: "eu-west-1", roleName: "infisical-app-connection" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provisioning?.region).toBe("eu-west-1");
      expect(result.data.provisioning?.roleName).toBe("infisical-app-connection");
    }
  });

  it("stays valid, with neither field set, when both are omitted", () => {
    const result = parse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provisioning).not.toHaveProperty("region");
      expect(result.data.provisioning).not.toHaveProperty("roleName");
    }
  });

  it.each(["", "eu west 1", "EU-WEST-1", "us-east", "s3.amazonaws.com", "a".repeat(21)])(
    "rejects the region %j",
    (region) => {
      expect(parse({ region }).success).toBe(false);
    }
  );

  it.each(["", "has space", "role/with/slash", "a".repeat(65)])("rejects the role name %j", (roleName) => {
    expect(parse({ roleName }).success).toBe(false);
  });

  it("accepts a role name using every character IAM allows", () => {
    expect(parse({ roleName: "a+b=c,d.e@f-g_h" }).success).toBe(true);
  });
});

describe("UpdateAwsConnectionSchema configuration", () => {
  const provisioning = {
    launchMethod: "launch-stack",
    useCases: ["secrets-manager", "parameter-store"],
    stackName: "infisical-aws-app-connection-abc123",
    partition: "aws",
    templateVersion: "1",
    region: "eu-west-1",
    roleName: "infisical-app-connection"
  };

  it("keeps a configuration sent without credentials", () => {
    const result = UpdateAwsConnectionSchema.safeParse({ configuration: { provisioning } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.configuration).toEqual({ provisioning });
  });

  it("accepts null provisioning to clear it", () => {
    const result = UpdateAwsConnectionSchema.safeParse({ configuration: { provisioning: null } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.configuration).toEqual({ provisioning: null });
  });

  it("rejects provisioning with no use cases", () => {
    const result = UpdateAwsConnectionSchema.safeParse({
      configuration: { provisioning: { ...provisioning, useCases: [] } }
    });
    expect(result.success).toBe(false);
  });

  it("still accepts an update without configuration", () => {
    expect(UpdateAwsConnectionSchema.safeParse({ name: "renamed" }).success).toBe(true);
  });
});
