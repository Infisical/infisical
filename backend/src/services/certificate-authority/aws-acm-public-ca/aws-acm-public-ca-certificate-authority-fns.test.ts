import { CertificateStatus } from "@aws-sdk/client-acm";

import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { CrlReason } from "@app/services/certificate/certificate-types";

import { CaStatus, CaType } from "../certificate-authority-enums";
import { AwsAcmValidationMethod } from "./aws-acm-public-ca-certificate-authority-enums";
import { AwsAcmPublicCaCertificateAuthorityFns } from "./aws-acm-public-ca-certificate-authority-fns";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("./aws-acm-public-ca-certificate-authority-client", () => ({
  createAcmClient: vi.fn().mockResolvedValue({ send }),
  resolveDnsAwsConnection: vi.fn()
}));

const CA_ID = "ca-1";
const SERIAL_NUMBER = "0a1b";
const CERTIFICATE_ARN = "arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012";

const buildFns = () =>
  AwsAcmPublicCaCertificateAuthorityFns({
    certificateAuthorityDAL: {
      findByIdWithAssociatedCa: vi.fn().mockResolvedValue({
        id: CA_ID,
        name: "acm",
        projectId: "project-1",
        enableDirectIssuance: true,
        status: CaStatus.ACTIVE,
        externalCa: {
          id: "external-1",
          type: CaType.AWS_ACM_PUBLIC_CA,
          appConnectionId: "connection-1",
          configuration: { region: AWSRegion.US_EAST_1, dnsAppConnectionId: "dns-1", hostedZoneId: "zone-1" }
        }
      })
    },
    certificateDAL: {
      findOneLiveFirst: vi.fn().mockResolvedValue({
        id: "cert-1",
        serialNumber: SERIAL_NUMBER,
        renewedByCertificateId: null,
        externalMetadata: {
          type: CaType.AWS_ACM_PUBLIC_CA,
          arn: CERTIFICATE_ARN,
          region: AWSRegion.US_EAST_1,
          validationMethod: AwsAcmValidationMethod.DNS
        }
      })
    }
  } as unknown as Parameters<typeof AwsAcmPublicCaCertificateAuthorityFns>[0]);

const respondTo = (handlers: Record<string, () => unknown>) =>
  send.mockImplementation(async (command: { constructor: { name: string } }) => handlers[command.constructor.name]());

describe("AWS ACM public CA revokeCertificate", () => {
  beforeEach(() => {
    send.mockReset();
  });

  test("resolves when the revoke fails because ACM already revoked the certificate", async () => {
    respondTo({
      RevokeCertificateCommand: () => {
        throw new Error("The certificate cannot be revoked in its current state");
      },
      DescribeCertificateCommand: () => ({ Certificate: { Status: CertificateStatus.REVOKED } })
    });

    await expect(
      buildFns().revokeCertificate({ caId: CA_ID, serialNumber: SERIAL_NUMBER, reason: CrlReason.KEY_COMPROMISE })
    ).resolves.toBeUndefined();
  });

  test("throws the revoke error when the certificate isn't revoked at ACM", async () => {
    respondTo({
      RevokeCertificateCommand: () => {
        throw new Error("User is not authorized to perform acm:RevokeCertificate");
      },
      DescribeCertificateCommand: () => ({ Certificate: { Status: CertificateStatus.ISSUED } })
    });

    await expect(
      buildFns().revokeCertificate({ caId: CA_ID, serialNumber: SERIAL_NUMBER, reason: CrlReason.KEY_COMPROMISE })
    ).rejects.toThrow(
      "Failed to revoke certificate via AWS Certificate Manager: User is not authorized to perform acm:RevokeCertificate"
    );
  });

  test("throws the revoke error when reading the certificate back also fails", async () => {
    respondTo({
      RevokeCertificateCommand: () => {
        throw new Error("Rate exceeded");
      },
      DescribeCertificateCommand: () => {
        throw new Error("Describe failed");
      }
    });

    await expect(
      buildFns().revokeCertificate({ caId: CA_ID, serialNumber: SERIAL_NUMBER, reason: CrlReason.KEY_COMPROMISE })
    ).rejects.toThrow("Failed to revoke certificate via AWS Certificate Manager: Rate exceeded");
  });
});
