import { createMongoAbility } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import { Knex } from "knex";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { ActorType } from "@app/services/auth/auth-type";
import { IssuerType } from "@app/services/certificate-profile/certificate-profile-types";

import { certificateServiceFactory } from "./certificate-service";
import { CertStatus } from "./certificate-types";

type TDeps = Parameters<typeof certificateServiceFactory>[0];

const tx = {} as Knex;
const deletedAt = new Date("2026-10-21T12:00:00.000Z");

const liveCertificate = {
  id: "cert-1",
  projectId: "project-1",
  applicationId: null,
  commonName: "web.example.com",
  friendlyName: "web",
  serialNumber: "0a1b",
  status: CertStatus.ACTIVE,
  notBefore: new Date("2026-01-01T00:00:00.000Z"),
  notAfter: new Date("2099-01-01T00:00:00.000Z"),
  fingerprintSha256: "AA:BB",
  source: null,
  deletedAt: null
};

const actor = {
  actor: ActorType.USER,
  actorId: "user-1",
  actorAuthMethod: null,
  actorOrgId: "org-1"
} as const;

const buildService = () => {
  const certificateDAL = {
    findById: vi.fn().mockResolvedValue(liveCertificate),
    findByIdForUpdate: vi.fn().mockResolvedValue(liveCertificate),
    update: vi
      .fn()
      .mockImplementation(async (_filter: unknown, data: Record<string, unknown>) => [{ ...liveCertificate, ...data }]),
    transaction: vi.fn().mockImplementation(async (run: (trx: Knex) => Promise<unknown>) => run(tx))
  };
  const certificateBodyDAL = { delete: vi.fn().mockResolvedValue([]) };
  const certificateSecretDAL = { delete: vi.fn().mockResolvedValue([]) };
  const pkiCollectionItemDAL = { delete: vi.fn().mockResolvedValue([]) };
  const certificateSyncDAL = { find: vi.fn().mockResolvedValue([]) };
  const signerDAL = { findOne: vi.fn().mockResolvedValue(undefined) };

  const deps = {
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    pkiCollectionItemDAL,
    certificateSyncDAL,
    signerDAL,
    resourceMetadataDAL: { find: vi.fn().mockResolvedValue([]) },
    permissionService: {
      getProjectPermission: vi
        .fn()
        .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) })
    },
    pkiApplicationDAL: { findById: vi.fn() },
    pkiSyncDAL: { find: vi.fn().mockResolvedValue([]) },
    certificateRequestDAL: { update: vi.fn().mockResolvedValue([]) },
    pkiSyncQueue: {},
    auditLogService: { createAuditLog: vi.fn() },
    usageMeteringService: { emitForProject: vi.fn() }
  } as unknown as TDeps;

  return {
    service: certificateServiceFactory(deps),
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    pkiCollectionItemDAL,
    certificateSyncDAL,
    signerDAL
  };
};

describe("certificateService.deleteCert", () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it("keeps the row and its sync links, stamps who deleted it, and removes its material and collection items", async () => {
    ctx.certificateSyncDAL.find.mockResolvedValue([{ pkiSyncId: "sync-1" }, { pkiSyncId: "sync-1" }]);

    const result = await ctx.service.deleteCert({
      id: "cert-1",
      ...actor,
      auditLogInfo: { userAgentType: UserAgentType.TERRAFORM } as never
    });

    expect(ctx.certificateDAL.update).toHaveBeenCalledWith(
      { $in: { id: ["cert-1"] }, deletedAt: null },
      expect.objectContaining({
        deletedByActorType: ActorType.USER,
        deletedByActorId: "user-1",
        deletedAt: expect.any(Date) as Date
      }),
      tx
    );
    expect(ctx.certificateBodyDAL.delete).toHaveBeenCalledWith({ $in: { certId: ["cert-1"] } }, tx);
    expect(ctx.certificateSecretDAL.delete).toHaveBeenCalledWith({ $in: { certId: ["cert-1"] } }, tx);
    expect(ctx.pkiCollectionItemDAL.delete).toHaveBeenCalledWith({ $in: { certId: ["cert-1"] } }, tx);
    expect(ctx.certificateSyncDAL.find).toHaveBeenCalledWith({ $in: { certificateId: ["cert-1"] } }, { tx });
    expect(result.statusAtDeletion).toBe(CertStatus.ACTIVE);
  });

  it("refuses a second delete with the date of the first one", async () => {
    ctx.certificateDAL.findById.mockResolvedValue({ ...liveCertificate, deletedAt });

    await expect(ctx.service.deleteCert({ id: "cert-1", ...actor })).rejects.toThrow(
      "Certificate 'web' was already deleted on 2026-10-21T12:00:00.000Z."
    );
    expect(ctx.certificateDAL.update).not.toHaveBeenCalled();
  });

  it("refuses when a concurrent delete committed first", async () => {
    ctx.certificateDAL.findByIdForUpdate.mockResolvedValue({ ...liveCertificate, deletedAt });

    await expect(ctx.service.deleteCert({ id: "cert-1", ...actor })).rejects.toThrow("was already deleted");
    expect(ctx.certificateDAL.update).not.toHaveBeenCalled();
    expect(ctx.certificateBodyDAL.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete a certificate a code signing signer uses", async () => {
    ctx.signerDAL.findOne.mockResolvedValue({ id: "signer-1" });

    await expect(ctx.service.deleteCert({ id: "cert-1", ...actor })).rejects.toThrow(
      "Cannot delete certificate because it is currently in use by a code signing signer"
    );
    expect(ctx.certificateDAL.update).not.toHaveBeenCalled();
  });
});

describe("certificateService.importCert with a CSR", () => {
  const ALG = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
  const CUSTOM_EKU_OID = "1.3.6.1.4.1.99999.1";

  const buildImportMaterial = async (csrExtensions: x509.Extension[] = []) => {
    const keys = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]);
    const [certificate, csr] = await Promise.all([
      x509.X509CertificateGenerator.createSelfSigned({
        serialNumber: "0a1b2c",
        name: "CN=web.example.com",
        notBefore: new Date("2026-01-01"),
        notAfter: new Date("2026-04-01"),
        keys,
        signingAlgorithm: ALG
      }),
      x509.Pkcs10CertificateRequestGenerator.create({
        name: "CN=web.example.com",
        keys,
        signingAlgorithm: ALG,
        extensions: csrExtensions
      })
    ]);
    return { certificatePem: certificate.toString("pem"), csr: csr.toString("pem") };
  };

  const buildImportService = () => {
    const certificateDAL = { transaction: vi.fn(), findOne: vi.fn().mockResolvedValue(undefined) };
    const certificatePolicyService = { validateCertificateRequest: vi.fn() };
    const deps = {
      certificateDAL,
      certificatePolicyService,
      certificateProfileDAL: {
        findByIdWithConfigs: vi.fn().mockResolvedValue({
          id: "profile-1",
          projectId: "project-1",
          slug: "web-servers",
          caId: "ca-1",
          issuerType: IssuerType.CA,
          certificatePolicyId: "policy-1",
          apiConfig: null,
          certificateAuthority: { externalType: null, name: "my-root-ca" }
        })
      },
      permissionService: {
        getProjectPermission: vi
          .fn()
          .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) })
      }
    } as unknown as TDeps;

    return { service: certificateServiceFactory(deps), certificateDAL, certificatePolicyService };
  };

  it("refuses a CSR the profile's policy would refuse at renewal, before storing anything", async () => {
    const { service, certificateDAL, certificatePolicyService } = buildImportService();
    certificatePolicyService.validateCertificateRequest.mockResolvedValue({
      isValid: false,
      errors: ["common name web.example.com is not allowed"],
      warnings: []
    });
    const { certificatePem, csr } = await buildImportMaterial();

    await expect(
      service.importCert({ ...actor, projectId: "project-1", profileId: "profile-1", certificatePem, csr })
    ).rejects.toThrow(/does not satisfy the policy of certificate profile 'web-servers'/);
    expect(certificatePolicyService.validateCertificateRequest).toHaveBeenCalledWith(
      "policy-1",
      expect.objectContaining({ commonName: "web.example.com", validity: { ttl: "90d" } })
    );
    expect(certificateDAL.transaction).not.toHaveBeenCalled();
  });

  it("checks the CSR with the algorithm the CA signed the certificate with and the certificate's usages", async () => {
    const { service, certificatePolicyService } = buildImportService();
    certificatePolicyService.validateCertificateRequest.mockResolvedValue({
      isValid: false,
      errors: ["stop after the check"],
      warnings: []
    });
    const RSA_ALG = {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
      publicExponent: new Uint8Array([1, 0, 1]),
      modulusLength: 2048
    };
    const [caKeys, leafKeys] = await Promise.all([
      crypto.subtle.generateKey(RSA_ALG, true, ["sign", "verify"]),
      crypto.subtle.generateKey(ALG, true, ["sign", "verify"])
    ]);
    const [certificate, csr] = await Promise.all([
      x509.X509CertificateGenerator.create({
        serialNumber: "0a1b2d",
        subject: "CN=web.example.com",
        issuer: "CN=rsa-root",
        notBefore: new Date("2026-01-01"),
        notAfter: new Date("2026-04-01"),
        publicKey: leafKeys.publicKey,
        signingKey: caKeys.privateKey,
        signingAlgorithm: RSA_ALG,
        extensions: [
          new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature),
          new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth])
        ]
      }),
      x509.Pkcs10CertificateRequestGenerator.create({
        name: "CN=web.example.com",
        keys: leafKeys,
        signingAlgorithm: ALG
      })
    ]);

    await expect(
      service.importCert({
        ...actor,
        projectId: "project-1",
        profileId: "profile-1",
        certificatePem: certificate.toString("pem"),
        csr: csr.toString("pem")
      })
    ).rejects.toThrow(/does not satisfy the policy/);
    expect(certificatePolicyService.validateCertificateRequest).toHaveBeenCalledWith(
      "policy-1",
      expect.objectContaining({
        keyAlgorithm: "EC_prime256v1",
        signatureAlgorithm: "RSA-SHA256",
        keyUsages: ["digital_signature"],
        extendedKeyUsages: ["server_auth"]
      })
    );
  });

  it("refuses a CSR with an extended key usage renewal can't carry, before storing anything", async () => {
    const { service, certificateDAL, certificatePolicyService } = buildImportService();
    const { certificatePem, csr } = await buildImportMaterial([new x509.ExtendedKeyUsageExtension([CUSTOM_EKU_OID])]);

    await expect(
      service.importCert({ ...actor, projectId: "project-1", profileId: "profile-1", certificatePem, csr })
    ).rejects.toThrow(`Unsupported extended key usage in CSR: ${CUSTOM_EKU_OID}`);
    expect(certificatePolicyService.validateCertificateRequest).not.toHaveBeenCalled();
    expect(certificateDAL.transaction).not.toHaveBeenCalled();
  });
});
