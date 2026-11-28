import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { CrlReason } from "@app/services/certificate/certificate-types";

import { CaStatus, CaType } from "../certificate-authority-enums";
import { GoDaddyCertificateStatus, GoDaddyProductType } from "./godaddy-certificate-authority-enums";
import { GoDaddyCertificateAuthorityFns } from "./godaddy-certificate-authority-fns";

const { client } = vi.hoisted(() => ({
  client: { revokeCertificate: vi.fn(), getCertificate: vi.fn() }
}));

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("./godaddy-api-client", () => ({ createGoDaddyApiClient: () => client }));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnectionCredentials: vi.fn().mockResolvedValue({ apiKey: "key", apiSecret: "secret" })
}));

const CA_ID = "ca-1";
const SERIAL_NUMBER = "0a1b";
const GODADDY_CERTIFICATE_ID = "godaddy-cert-1";
const REVOKE_ERROR = new BadRequestError({
  message: `GoDaddy certificate revocation for ${GODADDY_CERTIFICATE_ID} failed: Certificate state does not allow revoke`
});

const buildFns = (renewedByCertificateId: string | null = null) =>
  GoDaddyCertificateAuthorityFns({
    appConnectionDAL: {
      findById: vi.fn().mockResolvedValue({
        id: "connection-1",
        app: AppConnection.GoDaddy,
        orgId: "org-1",
        projectId: null,
        encryptedCredentials: Buffer.from("")
      })
    },
    certificateAuthorityDAL: {
      findByIdWithAssociatedCa: vi.fn().mockResolvedValue({
        id: CA_ID,
        name: "godaddy",
        projectId: "project-1",
        enableDirectIssuance: true,
        status: CaStatus.ACTIVE,
        externalCa: {
          id: "external-1",
          type: CaType.GODADDY,
          appConnectionId: "connection-1",
          configuration: { productType: GoDaddyProductType.DV_SSL }
        }
      })
    },
    certificateDAL: {
      findOneLiveFirst: vi.fn().mockResolvedValue({
        id: "cert-1",
        serialNumber: SERIAL_NUMBER,
        renewedByCertificateId,
        externalMetadata: { type: CaType.GODADDY, certificateId: GODADDY_CERTIFICATE_ID }
      })
    },
    kmsDataKeyService: {},
    kmsKeyService: {}
  } as unknown as Parameters<typeof GoDaddyCertificateAuthorityFns>[0]);

const revoke = (renewedByCertificateId: string | null = null) =>
  buildFns(renewedByCertificateId).revokeCertificate({
    caId: CA_ID,
    serialNumber: SERIAL_NUMBER,
    reason: CrlReason.KEY_COMPROMISE
  });

describe("GoDaddy revokeCertificate", () => {
  beforeEach(() => {
    client.revokeCertificate.mockReset().mockRejectedValue(REVOKE_ERROR);
    client.getCertificate.mockReset();
  });

  test("resolves when the revoke fails because GoDaddy already revoked the certificate", async () => {
    client.getCertificate.mockResolvedValue({
      certificateId: GODADDY_CERTIFICATE_ID,
      status: GoDaddyCertificateStatus.Revoked
    });

    await expect(revoke()).resolves.toBeUndefined();
    expect(client.getCertificate).toHaveBeenCalledWith(GODADDY_CERTIFICATE_ID);
  });

  test("throws the revoke error when the certificate isn't revoked at GoDaddy", async () => {
    client.getCertificate.mockResolvedValue({
      certificateId: GODADDY_CERTIFICATE_ID,
      status: GoDaddyCertificateStatus.PendingIssuance
    });

    await expect(revoke()).rejects.toBe(REVOKE_ERROR);
  });

  test("throws the revoke error when reading the certificate back also fails", async () => {
    client.getCertificate.mockRejectedValue(new BadRequestError({ message: "GoDaddy certificate lookup failed" }));

    await expect(revoke()).rejects.toBe(REVOKE_ERROR);
  });

  test("throws the revoke error for a renewed certificate even when GoDaddy reports the shared id as revoked", async () => {
    client.getCertificate.mockResolvedValue({
      certificateId: GODADDY_CERTIFICATE_ID,
      status: GoDaddyCertificateStatus.Revoked
    });

    await expect(revoke("cert-2")).rejects.toBe(REVOKE_ERROR);
  });

  test("doesn't read the certificate back when the revoke succeeds", async () => {
    client.revokeCertificate.mockResolvedValue(undefined);

    await expect(revoke()).resolves.toBeUndefined();
    expect(client.getCertificate).not.toHaveBeenCalled();
  });
});
