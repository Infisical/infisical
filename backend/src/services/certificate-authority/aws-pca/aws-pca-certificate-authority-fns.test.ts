import { RequestAlreadyProcessedException } from "@aws-sdk/client-acm-pca";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
