import { beforeEach, describe, expect, test, vi } from "vitest";

import { TDynamicSecrets } from "@app/db/schemas";

import { AwsIamProvider } from "./aws-iam";
import { AwsIamAuthType, AwsIamCredentialType } from "./models";

const aws = vi.hoisted(() => {
  const state = {
    irsaEnabled: false,
    calls: 0,
    FakeClient: class {
      // eslint-disable-next-line class-methods-use-this
      async send() {
        state.calls += 1;
        return { Credentials: { AccessKeyId: "access-key", SecretAccessKey: "secret-key", SessionToken: "token" } };
      }
    }
  };
  return state;
});

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ KUBERNETES_AUTO_FETCH_SERVICE_ACCOUNT_TOKEN: aws.irsaEnabled })
}));
vi.mock("@app/lib/crypto/cryptography", () => ({ crypto: { isFipsModeEnabled: () => false } }));
vi.mock("@app/lib/aws/hashing", () => ({ CustomAWSHasher: function CustomAWSHasher() {} }));
vi.mock("@aws-sdk/client-sts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aws-sdk/client-sts")>()),
  STSClient: aws.FakeClient
}));
vi.mock("@aws-sdk/client-iam", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aws-sdk/client-iam")>()),
  IAMClient: aws.FakeClient
}));

const irsaInputs = (credentialType: AwsIamCredentialType) => ({
  method: AwsIamAuthType.IRSA,
  credentialType,
  region: "us-east-1"
});

const createLease = (credentialType: AwsIamCredentialType) =>
  AwsIamProvider().create({
    inputs: irsaInputs(credentialType),
    expireAt: Date.now() + 60 * 60 * 1000,
    identity: { name: "user@example.com" },
    dynamicSecret: { id: "dynamic-secret-1" } as TDynamicSecrets,
    metadata: { projectId: "proj-1" }
  });

const IRSA_DISABLED_MESSAGE =
  "Failed to get AWS credentials via IRSA: KUBERNETES_AUTO_FETCH_SERVICE_ACCOUNT_TOKEN is not enabled.";

describe("AwsIamProvider IRSA", () => {
  beforeEach(() => {
    aws.irsaEnabled = false;
    aws.calls = 0;
  });

  test.each([
    [
      "connection check for temporary credentials",
      () =>
        AwsIamProvider().validateConnection(irsaInputs(AwsIamCredentialType.TemporaryCredentials), {
          projectId: "proj-1"
        })
    ],
    ["lease for temporary credentials", () => createLease(AwsIamCredentialType.TemporaryCredentials)],
    ["lease for an IAM user", () => createLease(AwsIamCredentialType.IamUser)]
  ])("refuses the %s when service account token fetching is off", async (_, run) => {
    await expect(run()).rejects.toThrow(IRSA_DISABLED_MESSAGE);
    expect(aws.calls).toBe(0);
  });

  test("issues temporary credentials when service account token fetching is on", async () => {
    aws.irsaEnabled = true;

    await expect(
      AwsIamProvider().validateConnection(irsaInputs(AwsIamCredentialType.TemporaryCredentials), {
        projectId: "proj-1"
      })
    ).resolves.toBe(true);
    const lease = await createLease(AwsIamCredentialType.TemporaryCredentials);

    expect(lease.data).toEqual({ ACCESS_KEY: "access-key", SECRET_ACCESS_KEY: "secret-key", SESSION_TOKEN: "token" });
  });
});
