import { RequestAlreadyProcessedException } from "@aws-sdk/client-acm-pca";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { CrlReason } from "@app/services/certificate/certificate-types";

import { CaStatus, CaType } from "../certificate-authority-enums";
import { AwsPcaCertificateAuthorityFns } from "./aws-pca-certificate-authority-fns";

const send = vi.fn();

vi.mock("@aws-sdk/client-acm-pca", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-acm-pca")>();
  return {
    ...actual,
    ACMPCAClient: vi.fn().mockImplementation(() => ({ send }))
  };
});

vi.mock("@app/lib/crypto/cryptography", () => ({ crypto: { isFipsModeEnabled: () => false } }));
vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnection: vi.fn().mockResolvedValue({})
}));
vi.mock("@app/services/app-connection/aws/aws-connection-fns", () => ({
  getAwsConnectionConfig: vi.fn().mockResolvedValue({ credentials: {}, region: "us-east-1" })
}));

const CA_ID = "ca-1";

type TCreateArgs = Parameters<ReturnType<typeof AwsPcaCertificateAuthorityFns>["createCertificateAuthority"]>[0];

const buildFns = () =>
  AwsPcaCertificateAuthorityFns({
    appConnectionDAL: { findById: vi.fn().mockResolvedValue({ id: "connection-1" }) },
    certificateAuthorityDAL: {
      findByIdWithAssociatedCa: vi.fn().mockResolvedValue({
        id: CA_ID,
        name: "private-aws",
        projectId: "project-1",
        status: CaStatus.ACTIVE,
        enableDirectIssuance: true,
        externalCa: {
          id: "external-1",
          type: CaType.AWS_PCA,
          appConnectionId: "connection-1",
          configuration: {
            certificateAuthorityArn: "arn:aws:acm-pca:us-east-1:111122223333:certificate-authority/example",
            region: "us-east-1"
          }
        }
      })
    }
  } as unknown as Parameters<typeof AwsPcaCertificateAuthorityFns>[0]);

describe("AWS PCA revokeCertificate", () => {
  beforeEach(() => {
    send.mockReset();
  });

  it("treats a certificate AWS already revoked as revoked, so a retry can finish", async () => {
    send.mockRejectedValue(new RequestAlreadyProcessedException({ message: "already revoked", $metadata: {} }));

    await expect(
      buildFns().revokeCertificate({ caId: CA_ID, serialNumber: "0a1b", reason: CrlReason.KEY_COMPROMISE })
    ).resolves.toBeUndefined();
  });

  it("still surfaces any other AWS error", async () => {
    const throttled = new Error("Rate exceeded");
    send.mockRejectedValue(throttled);

    await expect(
      buildFns().revokeCertificate({ caId: CA_ID, serialNumber: "0a1b", reason: CrlReason.KEY_COMPROMISE })
    ).rejects.toBe(throttled);
  });
});

describe("AWS PCA createCertificateAuthority setup check", () => {
  beforeEach(() => {
    send.mockReset();
  });

  const runSetup = () => {
    const fns = AwsPcaCertificateAuthorityFns({
      appConnectionDAL: { findById: vi.fn().mockResolvedValue({ id: "connection-1", app: "aws" }) },
      appConnectionService: { validateAppConnectionUsageById: vi.fn().mockResolvedValue({}) },
      certificateAuthorityDAL: {}
    } as unknown as Parameters<typeof AwsPcaCertificateAuthorityFns>[0]);

    return fns.createCertificateAuthority({
      name: "private-aws",
      projectId: "project-1",
      status: CaStatus.ACTIVE,
      configuration: {
        appConnectionId: "connection-1",
        certificateAuthorityArn: "arn:aws:acm-pca:us-east-1:111122223333:certificate-authority/example",
        region: "us-east-1"
      } as TCreateArgs["configuration"],
      actor: {} as TCreateArgs["actor"]
    });
  };

  const awsError = (name: string, extra: Record<string, unknown> = {}) =>
    Object.assign(new Error(name), { name, $metadata: {}, ...extra });

  it("answers a 400 naming the missing instance credentials when the role can't be assumed", async () => {
    const missingCredentials = new Error("Could not load credentials from any providers");
    missingCredentials.name = "CredentialsProviderError";
    send.mockRejectedValue(missingCredentials);

    const setup = runSetup();
    await expect(setup).rejects.toBeInstanceOf(BadRequestError);
    await expect(setup).rejects.toThrow("could not load its own AWS credentials to assume the AWS connection's role");
  });

  it.each([
    ["throttling", awsError("ThrottlingException", { $fault: "client", $metadata: { httpStatusCode: 400 } })],
    ["an AWS server fault", awsError("InternalFailure", { $fault: "server", $metadata: { httpStatusCode: 500 } })],
    ["a 503 from AWS", awsError("ServiceUnavailable", { $metadata: { httpStatusCode: 503 } })]
  ])("answers %s with a retryable 500 rather than a 400", async (_label, error) => {
    send.mockRejectedValue(error);

    const setup = runSetup();
    await expect(setup).rejects.toBeInstanceOf(InternalServerError);
    await expect(setup).rejects.toThrow(
      `AWS Private CA did not answer Infisical's check (${error.name}). This is a temporary problem on AWS's side`
    );
  });

  it("still answers a credential denial with a 400", async () => {
    send.mockRejectedValue(awsError("AccessDeniedException", { $fault: "client", $metadata: { httpStatusCode: 403 } }));

    await expect(runSetup()).rejects.toBeInstanceOf(BadRequestError);
  });
});
