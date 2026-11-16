import { RequestAlreadyProcessedException, ResourceNotFoundException } from "@aws-sdk/client-acm-pca";

import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { CrlReason } from "@app/services/certificate/certificate-types";

import { CaStatus, CaType } from "../certificate-authority-enums";
import { AwsPcaCertificateAuthorityFns } from "./aws-pca-certificate-authority-fns";

const { pcaSend } = vi.hoisted(() => ({ pcaSend: vi.fn() }));

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/lib/crypto/cryptography", () => ({ crypto: { isFipsModeEnabled: () => false } }));
vi.mock("@app/lib/aws/hashing", () => ({ CustomAWSHasher: function CustomAWSHasher() {} }));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({ decryptAppConnection: vi.fn() }));
vi.mock("@app/services/app-connection/aws/aws-connection-fns", () => ({
  getAwsConnectionConfig: async () => ({ region: "us-east-1", credentials: { accessKeyId: "a", secretAccessKey: "b" } })
}));
vi.mock("@aws-sdk/client-acm-pca", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    ACMPCAClient: class {
      send = pcaSend;
    }
  };
});

const CA_ID = "ca-1";
const SERIAL_NUMBER = "0a1b";

const buildFns = () =>
  AwsPcaCertificateAuthorityFns({
    appConnectionDAL: { findById: vi.fn().mockResolvedValue({ id: "connection-1" }) },
    certificateAuthorityDAL: {
      findByIdWithAssociatedCa: vi.fn().mockResolvedValue({
        id: CA_ID,
        name: "pca",
        projectId: "project-1",
        enableDirectIssuance: true,
        status: CaStatus.ACTIVE,
        externalCa: {
          id: "external-1",
          type: CaType.AWS_PCA,
          appConnectionId: "connection-1",
          configuration: {
            certificateAuthorityArn: "arn:aws:acm-pca:us-east-1:123456789012:certificate-authority/ca",
            region: AWSRegion.US_EAST_1
          }
        }
      })
    },
    kmsService: {}
  } as unknown as Parameters<typeof AwsPcaCertificateAuthorityFns>[0]);

const revoke = () =>
  buildFns().revokeCertificate({ caId: CA_ID, serialNumber: SERIAL_NUMBER, reason: CrlReason.KEY_COMPROMISE });

describe("AWS PCA revokeCertificate", () => {
  beforeEach(() => {
    pcaSend.mockReset();
  });

  test("resolves when AWS PCA reports the certificate already revoked", async () => {
    pcaSend.mockRejectedValue(
      new RequestAlreadyProcessedException({ message: "Your request has already been completed.", $metadata: {} })
    );

    await expect(revoke()).resolves.toBeUndefined();
  });

  test("throws other AWS PCA errors unchanged", async () => {
    const error = new ResourceNotFoundException({ message: "Certificate not found", $metadata: {} });
    pcaSend.mockRejectedValue(error);

    await expect(revoke()).rejects.toBe(error);
  });
});
