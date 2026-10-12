import { ProjectType } from "@app/db/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { AwsConnectionMethod } from "./aws-connection-enums";
import { getAwsConnectionConfig } from "./aws-connection-fns";
import { TAwsConnectionConfig } from "./aws-connection-types";

const sts = vi.hoisted(() => ({
  externalIds: [] as (string | undefined)[],
  rejectionsLeft: 0
}));

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));
vi.mock("@app/lib/crypto/cryptography", () => ({
  crypto: { isFipsModeEnabled: () => false, nativeCrypto: { randomUUID: () => "session" } }
}));
vi.mock("@app/lib/aws/hashing", () => ({ CustomAWSHasher: function CustomAWSHasher() {} }));
vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
}));
vi.mock("@aws-sdk/client-sts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-sts")>();
  return {
    ...actual,
    STSClient: class {
      // eslint-disable-next-line class-methods-use-this
      async send(command: { input: { ExternalId?: string } }) {
        sts.externalIds.push(command.input.ExternalId);
        if (sts.rejectionsLeft > 0) {
          sts.rejectionsLeft -= 1;
          throw new Error("not authorized to perform: sts:AssumeRole");
        }
        return { Credentials: { AccessKeyId: "access-key", SecretAccessKey: "secret-key", SessionToken: "token" } };
      }
    }
  };
});

const assumeRoleConnection = (overrides: Partial<TAwsConnectionConfig>) =>
  ({
    app: AppConnection.AWS,
    method: AwsConnectionMethod.AssumeRole,
    credentials: { roleArn: "arn:aws:iam::123456789012:role/infisical" },
    orgId: "org-1",
    projectId: "proj-1",
    version: 2,
    ...overrides
  }) as TAwsConnectionConfig;

describe("getAwsConnectionConfig External ID", () => {
  beforeEach(() => {
    sts.externalIds = [];
    sts.rejectionsLeft = 0;
  });

  test.each([
    ["Agent Vault", { projectType: ProjectType.AgentVault }, ["org-1"]],
    ["Certificate Manager", { projectType: ProjectType.CertificateManager }, ["org-1"]],
    ["Secret Manager", { projectType: ProjectType.SecretManager }, ["proj-1"]],
    ["organization", { projectId: null }, ["org-1"]],
    ["legacy project", { version: 1, projectType: ProjectType.SecretManager }, ["org-1"]]
  ])("%s connections assume the role with the expected External ID", async (_, overrides, expected) => {
    await getAwsConnectionConfig(assumeRoleConnection(overrides));

    expect(sts.externalIds).toEqual(expected);
  });

  test("Agent Vault connections do not retry with the project ID", async () => {
    sts.rejectionsLeft = 1;

    await expect(getAwsConnectionConfig(assumeRoleConnection({ projectType: ProjectType.AgentVault }))).rejects.toThrow(
      "sts:AssumeRole"
    );
    expect(sts.externalIds).toEqual(["org-1"]);
  });

  test("Certificate Manager connections retry with the project ID", async () => {
    sts.rejectionsLeft = 1;

    await getAwsConnectionConfig(assumeRoleConnection({ projectType: ProjectType.CertificateManager }));

    expect(sts.externalIds).toEqual(["org-1", "proj-1"]);
  });
});
