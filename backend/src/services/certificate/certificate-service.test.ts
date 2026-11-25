import { createMongoAbility, ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import { Knex } from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import {
  ResourcePermissionCertificateActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError, PermissionBoundaryError } from "@app/lib/errors";
import {
  ApprovalPolicyType,
  ApprovalRequestStatus,
  ApproverType
} from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalRequest } from "@app/services/approval-policy/approval-policy-types";
import { ActorType } from "@app/services/auth/auth-type";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { IssuerType } from "@app/services/certificate-profile/certificate-profile-types";

import { certificateServiceFactory } from "./certificate-service";
import { CertificateRevocationSource, CertificateRevocationStatus, CertStatus, CrlReason } from "./certificate-types";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

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
    transaction: vi.fn().mockImplementation(async (run: (trx: Knex) => Promise<unknown>) => run(tx)),
    lockSerialNumber: vi.fn().mockResolvedValue(undefined)
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
    usageMeteringService: { emit: vi.fn() }
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
    const certificateDAL = {
      transaction: vi.fn(),
      find: vi.fn().mockResolvedValue([]),
      findSameCertificateRecords: vi.fn().mockResolvedValue([]),
      primaryNode: vi.fn().mockReturnValue(undefined)
    };
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

describe("certificateService.importCert of a certificate deleted before", () => {
  const ALG = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
  const importTx = { node: "import-tx" } as unknown as Knex;
  const importPrimaryDb = { node: "import-primary" } as unknown as Knex;

  const buildPlainImportService = () => {
    const projectDAL = {
      findById: vi.fn().mockImplementation(async (id: string) => ({ id, orgId: "org-1" })),
      find: vi
        .fn()
        .mockImplementation(async ({ $in: { id: ids } }: { $in: { id: string[] } }) =>
          ids.map((id) => ({ id, orgId: id === "other-org-project" ? "org-2" : "org-1" }))
        )
    };
    const certificateDAL = {
      transaction: vi.fn().mockImplementation(async (run: (trx: Knex) => Promise<unknown>) => run(importTx)),
      lockSerialNumber: vi.fn().mockResolvedValue(undefined),
      find: vi.fn().mockResolvedValue([]),
      primaryNode: vi.fn().mockReturnValue(importPrimaryDb),
      create: vi.fn().mockImplementation(async (data: Record<string, unknown>) => ({ ...data, id: "cert-2" }))
    };
    const deps = {
      certificateDAL,
      certificateBodyDAL: { create: vi.fn().mockResolvedValue({}) },
      certificateSecretDAL: { create: vi.fn().mockResolvedValue({}) },
      kmsDataKeyService: { getProjectCertificateKmsKeyId: vi.fn().mockResolvedValue("kms-1") },
      kmsKeyService: {
        encryptWithKmsKey: vi.fn().mockResolvedValue(async ({ plainText }: { plainText: Buffer }) => ({
          cipherTextBlob: plainText
        }))
      },
      projectDAL,
      licenseService: { getPlan: vi.fn().mockResolvedValue({ isLimited: () => false }) },
      usageMeteringService: { emit: vi.fn() },
      permissionService: {
        getProjectPermission: vi
          .fn()
          .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) })
      }
    } as unknown as TDeps;
    return { service: certificateServiceFactory(deps), certificateDAL, projectDAL };
  };

  const buildCertificatePem = async () => {
    const keys = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]);
    const certificate = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "0a1b2c",
      name: "CN=web.example.com",
      notBefore: new Date("2026-01-01"),
      notAfter: new Date("2026-04-01"),
      keys,
      signingAlgorithm: ALG
    });
    return certificate.toString("pem");
  };

  it("stores a new certificate when its earlier record was deleted without being revoked", async () => {
    const { service, certificateDAL } = buildPlainImportService();

    const result = await service.importCert({
      ...actor,
      projectId: "project-1",
      certificatePem: await buildCertificatePem()
    });

    expect(result.cert.id).toBe("cert-2");
    const revokedSerialFilter = {
      $in: { serialNumber: ["0a1b2c", "a1b2c", "a1b2c".padStart(40, "0")] },
      status: CertStatus.REVOKED
    };
    expect(certificateDAL.find.mock.calls).toEqual([
      [revokedSerialFilter, { tx: importPrimaryDb }],
      [revokedSerialFilter, { tx: importTx }],
      [
        { $in: revokedSerialFilter.$in, deletedAt: null },
        { limit: 1, tx: importTx }
      ]
    ]);
    expect(certificateDAL.lockSerialNumber).toHaveBeenCalledWith("0a1b2c", importTx);
    expect(certificateDAL.lockSerialNumber.mock.invocationCallOrder[0]).toBeLessThan(
      certificateDAL.find.mock.invocationCallOrder[1]
    );
  });

  it("refuses a revoked certificate before validating the chain it was sent with", async () => {
    const { service, certificateDAL } = buildPlainImportService();
    certificateDAL.find.mockResolvedValue([
      {
        id: "cert-0",
        projectId: "project-1",
        status: CertStatus.REVOKED,
        deletedAt: new Date("2026-10-01T00:00:00.000Z")
      }
    ]);

    await expect(
      service.importCert({
        ...actor,
        projectId: "project-1",
        certificatePem: await buildCertificatePem(),
        chainPem: "not a certificate chain"
      })
    ).rejects.toThrow(
      new BadRequestError({
        message: "Certificate with serial number '0a1b2c' is revoked and can't be imported."
      })
    );
    expect(certificateDAL.create).not.toHaveBeenCalled();
  });

  it("refuses under the serial lock when the certificate is revoked while it is being imported", async () => {
    const { service, certificateDAL } = buildPlainImportService();
    certificateDAL.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "cert-0", projectId: "project-1", status: CertStatus.REVOKED, deletedAt: new Date() }
      ]);

    await expect(
      service.importCert({ ...actor, projectId: "project-1", certificatePem: await buildCertificatePem() })
    ).rejects.toThrow("is revoked and can't be imported.");
    expect(certificateDAL.create).not.toHaveBeenCalled();
  });

  it("refuses under the serial lock when a live record stores the serial with a leading zero byte", async () => {
    const { service, certificateDAL } = buildPlainImportService();
    certificateDAL.find.mockImplementation(async (filter: { deletedAt?: null }) =>
      "deletedAt" in filter ? [{ id: "cert-0", serialNumber: "000a1b2c", deletedAt: null }] : []
    );

    await expect(
      service.importCert({ ...actor, projectId: "project-1", certificatePem: await buildCertificatePem() })
    ).rejects.toThrow(new BadRequestError({ message: "A certificate with this serial number already exists" }));
    expect(certificateDAL.create).not.toHaveBeenCalled();
  });

  it("imports a different certificate that shares a revoked certificate's serial number", async () => {
    const { service, certificateDAL } = buildPlainImportService();
    certificateDAL.find.mockImplementation(async (filter: { deletedAt?: null }) =>
      "deletedAt" in filter
        ? []
        : [
            {
              id: "cert-0",
              projectId: "project-1",
              status: CertStatus.REVOKED,
              fingerprintSha256: "AA:BB",
              deletedAt: new Date("2026-10-01T00:00:00.000Z")
            }
          ]
    );

    const result = await service.importCert({
      ...actor,
      projectId: "project-1",
      certificatePem: await buildCertificatePem()
    });

    expect(result.cert.id).toBe("cert-2");
  });

  it("imports a certificate whose serial was revoked only in another organization", async () => {
    const { service, certificateDAL, projectDAL } = buildPlainImportService();
    certificateDAL.find.mockImplementation(async (filter: { deletedAt?: null }) =>
      "deletedAt" in filter
        ? []
        : [
            {
              id: "cert-0",
              projectId: "other-org-project",
              status: CertStatus.REVOKED,
              deletedAt: new Date("2026-10-01T00:00:00.000Z")
            }
          ]
    );

    const result = await service.importCert({
      ...actor,
      projectId: "project-1",
      certificatePem: await buildCertificatePem()
    });

    expect(result.cert.id).toBe("cert-2");
    expect(projectDAL.find).toHaveBeenCalledWith({ $in: { id: ["other-org-project"] } }, { tx: importPrimaryDb });
  });

  it("refuses a revoked certificate that was never deleted, as revoked", async () => {
    const { service, certificateDAL } = buildPlainImportService();
    certificateDAL.find.mockResolvedValue([
      { id: "cert-0", projectId: "project-1", status: CertStatus.REVOKED, deletedAt: null }
    ]);

    await expect(
      service.importCert({ ...actor, projectId: "project-1", certificatePem: await buildCertificatePem() })
    ).rejects.toThrow(
      new BadRequestError({
        message: "Certificate with serial number '0a1b2c' is revoked and can't be imported."
      })
    );
    expect(certificateDAL.create).not.toHaveBeenCalled();
  });
});

describe("certificateService.importCert of a deleted certificate into a profile on its CA", () => {
  const ALG = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
  const deletedOriginal = {
    id: "cert-0",
    projectId: "project-1",
    applicationId: "app-a",
    profileId: "profile-1",
    caId: "ca-1",
    commonName: "web.example.com",
    friendlyName: "web",
    serialNumber: "0a1b2c",
    status: CertStatus.ACTIVE,
    deletedAt: new Date("2026-10-01T00:00:00.000Z")
  };
  const originalPolicy = { id: "revocation-policy-1", name: "prod-revocations" };

  const buildReimportService = ({
    originalPermissions = [{ action: "manage", subject: "all" }] as RawRuleOf<MongoAbility>[],
    isMemberOfOriginalApplication = true,
    policyByScope = {} as Record<string, typeof originalPolicy>,
    deletedRecords = [deletedOriginal] as Record<string, unknown>[],
    deletedRecordsUnderLock = undefined as Record<string, unknown>[] | undefined
  } = {}) => {
    const importTx = { node: "reimport-tx" } as unknown as Knex;
    const certificateDAL = {
      transaction: vi.fn().mockImplementation(async (run: (trx: Knex) => Promise<unknown>) => run(importTx)),
      primaryNode: vi.fn().mockReturnValue(undefined),
      lockSerialNumber: vi.fn().mockResolvedValue(undefined),
      find: vi.fn().mockResolvedValue([]),
      findSameCertificateRecords: vi
        .fn()
        .mockImplementation(async (_filter: unknown, trx: unknown) =>
          trx === importTx ? (deletedRecordsUnderLock ?? deletedRecords) : deletedRecords
        ),
      create: vi.fn().mockImplementation(async (data: Record<string, unknown>) => ({ ...data, id: "cert-2" }))
    };
    const certificatePolicyService = {
      validateCertificateRequest: vi.fn().mockResolvedValue({ isValid: false, errors: ["stop here"], warnings: [] })
    };
    const approvalPolicyService = {
      matchPolicy: vi
        .fn()
        .mockImplementation(
          async (
            _type: unknown,
            _projectId: string,
            { applicationId, profileName }: { applicationId: string; profileName: string }
          ) => policyByScope[`${applicationId}/${profileName}`] ?? null
        )
    };
    const deps = {
      certificateDAL,
      certificatePolicyService,
      approvalPolicyService,
      certificateProfileDAL: {
        findById: vi
          .fn()
          .mockImplementation(async (id: string) => ({ id, slug: id === "profile-1" ? "web-servers" : "old-servers" })),
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
      pkiApplicationDAL: {
        findById: vi.fn().mockImplementation(async (id: string) => ({ id, name: id, projectId: "project-1" }))
      },
      pkiApplicationProfileDAL: { findOneByApplicationAndProfile: vi.fn().mockResolvedValue({ id: "attachment-1" }) },
      resourceMetadataDAL: { find: vi.fn().mockResolvedValue([]) },
      certificateBodyDAL: { create: vi.fn().mockResolvedValue({}) },
      certificateSecretDAL: { create: vi.fn().mockResolvedValue({}) },
      kmsDataKeyService: { getProjectCertificateKmsKeyId: vi.fn().mockResolvedValue("kms-1") },
      kmsKeyService: {
        encryptWithKmsKey: vi.fn().mockResolvedValue(async ({ plainText }: { plainText: Buffer }) => ({
          cipherTextBlob: plainText
        }))
      },
      projectDAL: { findById: vi.fn().mockResolvedValue({ id: "project-1", orgId: "org-1" }) },
      licenseService: { getPlan: vi.fn().mockResolvedValue({ isLimited: () => false }) },
      usageMeteringService: { emit: vi.fn() },
      permissionService: {
        getProjectPermission: vi
          .fn()
          .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) }),
        getResourcePermission: vi.fn().mockImplementation(async ({ resourceId }: { resourceId: string }) => {
          if (resourceId === "app-a" && !isMemberOfOriginalApplication) {
            throw new ForbiddenRequestError({ message: "You are not a member of this certificate-application." });
          }
          return {
            permission: createMongoAbility(
              resourceId === "app-a" ? originalPermissions : [{ action: "manage", subject: "all" }]
            )
          };
        })
      }
    } as unknown as TDeps;
    return {
      service: certificateServiceFactory(deps),
      approvalPolicyService,
      certificateDAL,
      certificatePolicyService
    };
  };

  const buildCertificatePem = async () => {
    const keys = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]);
    const certificate = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "0a1b2c",
      name: "CN=web.example.com",
      notBefore: new Date("2026-01-01"),
      notAfter: new Date("2026-04-01"),
      keys,
      signingAlgorithm: ALG
    });
    return certificate.toString("pem");
  };

  it("refuses an importer who can't revoke the deleted original directly when no approval policy covers it", async () => {
    const { service } = buildReimportService({
      originalPermissions: [
        { action: ResourcePermissionCertificateActions.RequestRevocation, subject: ResourcePermissionSub.Certificates }
      ]
    });

    await expect(
      service.importCert({
        ...actor,
        projectId: "project-1",
        profileId: "profile-1",
        certificatePem: await buildCertificatePem()
      })
    ).rejects.toThrow(
      new PermissionBoundaryError({
        message:
          "Certificate 'web' was deleted from Application 'app-a'. Importing it again needs permission to revoke it in 'app-a'.",
        details: { missingPermissions: [{ action: "delete", subject: "certificates" }] }
      })
    );
  });

  it("explains the refusal when the importer has no permission on the deleted original's Application", async () => {
    const { service } = buildReimportService({ originalPermissions: [] });

    await expect(
      service.importCert({
        ...actor,
        projectId: "project-1",
        profileId: "profile-1",
        certificatePem: await buildCertificatePem()
      })
    ).rejects.toThrow(
      new PermissionBoundaryError({
        message:
          "Certificate 'web' was deleted from Application 'app-a'. Importing it again needs permission to revoke it in 'app-a'.",
        details: { missingPermissions: [{ action: "request-revocation", subject: "certificates" }] }
      })
    );
  });

  it("names neither the certificate nor its Application to an importer who isn't a member of that Application", async () => {
    const { service } = buildReimportService({ isMemberOfOriginalApplication: false });

    await expect(
      service.importCert({
        ...actor,
        projectId: "project-1",
        profileId: "profile-1",
        certificatePem: await buildCertificatePem()
      })
    ).rejects.toThrow(
      "Importing this certificate again needs permission to revoke a deleted copy of it in an Application you don't have access to."
    );
  });

  it("skips the check for a deleted record in the same Application and profile as the import", async () => {
    const { service, approvalPolicyService } = buildReimportService({
      policyByScope: { "app-a/web-servers": originalPolicy }
    });

    await expect(
      service.importCert({
        ...actor,
        projectId: "project-1",
        applicationId: "app-a",
        profileId: "profile-1",
        certificatePem: await buildCertificatePem()
      })
    ).rejects.toThrow("stop here");
    expect(approvalPolicyService.matchPolicy).not.toHaveBeenCalled();
  });

  it("refuses an import where the deleted original's revocation approval policy would not apply", async () => {
    const { service } = buildReimportService({ policyByScope: { "app-a/web-servers": originalPolicy } });

    await expect(
      service.importCert({
        ...actor,
        projectId: "project-1",
        applicationId: "app-b",
        profileId: "profile-1",
        certificatePem: await buildCertificatePem()
      })
    ).rejects.toThrow(
      new BadRequestError({
        message:
          "Certificate 'web' is covered by revocation approval policy 'prod-revocations'. Import it into an Application and profile covered by the same policy."
      })
    );
  });

  it("checks every deleted record of the certificate, not only the most recent one", async () => {
    const { service } = buildReimportService({
      policyByScope: { "app-a/web-servers": originalPolicy },
      deletedRecords: [
        { ...deletedOriginal, id: "cert-1", applicationId: "app-b", deletedAt: new Date("2026-11-01T00:00:00.000Z") },
        deletedOriginal
      ]
    });

    await expect(
      service.importCert({
        ...actor,
        projectId: "project-1",
        applicationId: "app-b",
        profileId: "profile-1",
        certificatePem: await buildCertificatePem()
      })
    ).rejects.toThrow("is covered by revocation approval policy 'prod-revocations'");
  });

  it("refuses an import into another profile of the same Application that the policy does not cover", async () => {
    const { service } = buildReimportService({
      policyByScope: { "app-a/old-servers": originalPolicy },
      deletedRecords: [{ ...deletedOriginal, profileId: "profile-0" }]
    });

    await expect(
      service.importCert({
        ...actor,
        projectId: "project-1",
        applicationId: "app-a",
        profileId: "profile-1",
        certificatePem: await buildCertificatePem()
      })
    ).rejects.toThrow("is covered by revocation approval policy 'prod-revocations'");
  });

  it("refuses under the serial lock when the certificate was deleted again after the checks ran", async () => {
    const { service, certificateDAL, certificatePolicyService } = buildReimportService({
      deletedRecords: [],
      deletedRecordsUnderLock: [{ ...deletedOriginal, id: "cert-3" }]
    });
    certificatePolicyService.validateCertificateRequest.mockResolvedValue({ isValid: true, errors: [], warnings: [] });

    await expect(
      service.importCert({
        ...actor,
        projectId: "project-1",
        profileId: "profile-1",
        certificatePem: await buildCertificatePem()
      })
    ).rejects.toThrow("was deleted while it was being imported. Import it again.");
    expect(certificateDAL.lockSerialNumber).toHaveBeenCalled();
    expect(certificateDAL.create).not.toHaveBeenCalled();
  });

  it("allows the import where the same approval policy covers the new certificate", async () => {
    const { service, approvalPolicyService } = buildReimportService({
      policyByScope: { "app-a/old-servers": originalPolicy, "app-a/web-servers": originalPolicy },
      deletedRecords: [{ ...deletedOriginal, profileId: "profile-0" }]
    });

    await expect(
      service.importCert({
        ...actor,
        projectId: "project-1",
        applicationId: "app-a",
        profileId: "profile-1",
        certificatePem: await buildCertificatePem()
      })
    ).rejects.toThrow("stop here");
    expect(approvalPolicyService.matchPolicy).toHaveBeenCalledTimes(2);
  });
});

describe("certificate revocation behind an approval policy", () => {
  const applicationCertificate = {
    ...liveCertificate,
    applicationId: "app-1",
    profileId: "profile-1",
    caId: "ca-1",
    altNames: null
  };

  const externalCa = {
    id: "ca-1",
    name: "aws-pca",
    projectId: "project-1",
    status: "active",
    enableDirectIssuance: true,
    externalCa: { id: "external-ca-1", type: CaType.AWS_PCA },
    internalCa: null
  };

  const internalCa = {
    id: "ca-1",
    name: "root",
    projectId: "project-1",
    status: "active",
    enableDirectIssuance: true,
    externalCa: null,
    internalCa: { id: "internal-ca-1", keyAlgorithm: "RSA_2048", notAfter: new Date("2099-01-01T00:00:00.000Z") }
  };

  const revocationPolicy = {
    id: "policy-1",
    name: "prod-revocations",
    maxRequestTtl: null,
    steps: [{ requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: "user-2" }], approverCount: 1 }]
  };

  const approvedRevocation = {
    id: "approval-request-1",
    projectId: "project-1",
    organizationId: "org-1",
    requesterId: "user-1",
    requesterName: "Ada Lovelace",
    requesterEmail: "requester@example.com",
    machineIdentityId: null,
    requestData: {
      version: 1,
      requestData: {
        certificateId: "cert-1",
        serialNumber: applicationCertificate.serialNumber,
        commonName: applicationCertificate.commonName,
        profileId: "profile-1",
        profileName: "web-servers",
        applicationId: "app-1",
        revocationReason: CrlReason.KEY_COMPROMISE
      }
    }
  } as unknown as TApprovalRequest;

  const primaryDb = { node: "primary" } as unknown as Knex;

  type TAuditLog = { event: { type: EventType; metadata: Record<string, unknown> } };

  const buildRevocationService = ({
    ca = externalCa as object,
    applicationPermissions = [{ action: "manage", subject: "all" }] as RawRuleOf<MongoAbility>[]
  } = {}) => {
    let stored: Record<string, unknown> = { ...applicationCertificate };
    const otherRecordsUpdate = vi.fn().mockResolvedValue([]);
    const certificateDAL = {
      findById: vi.fn().mockImplementation(async () => stored),
      findByIdForUpdate: vi.fn().mockImplementation(async () => stored),
      update: vi.fn().mockImplementation(async (filter: object, data: Record<string, unknown>, trx?: Knex) => {
        if ("$in" in filter) return otherRecordsUpdate(filter, data, trx) as Promise<unknown[]>;
        stored = { ...stored, ...data };
        return [stored];
      }),
      transaction: vi.fn().mockImplementation(async (run: (trx: Knex) => Promise<unknown>) => run(tx)),
      findPendingRevocationApprovalRequest: vi.fn().mockResolvedValue(undefined),
      primaryNode: vi.fn().mockReturnValue(primaryDb),
      findByThumbprintInOrg: vi.fn().mockResolvedValue([]),
      lockSerialNumber: vi.fn().mockResolvedValue(undefined),
      findSameCertificateRecords: vi.fn().mockResolvedValue([])
    };
    const certificateAuthorityDAL = { findByIdWithAssociatedCa: vi.fn().mockResolvedValue(ca) };
    const certificateProfileDAL = {
      findById: vi.fn().mockResolvedValue({ id: "profile-1", slug: "web-servers" })
    };
    const certificateAuthorityService = { revokeCertificate: vi.fn().mockResolvedValue(undefined) };
    const certificateAlertEventEmitter = { notify: vi.fn().mockResolvedValue(undefined) };
    const auditLogService = { createAuditLog: vi.fn().mockResolvedValue(undefined) };
    const approvalPolicyService = {
      matchPolicy: vi.fn().mockResolvedValue(revocationPolicy),
      isPendingRequestUndecidable: vi.fn().mockResolvedValue(false),
      createRequestFromPolicy: vi.fn().mockResolvedValue({
        request: { id: "approval-request-1", requesterName: "Ada Lovelace", requesterEmail: "ada@example.com" },
        notifyApprovers: vi.fn().mockResolvedValue(undefined)
      }),
      notifyApprovedActionFailed: vi.fn().mockResolvedValue(undefined)
    };
    const approvalRequestDAL = {
      update: vi.fn().mockResolvedValue([{ id: "approval-request-0" }]),
      findByIdForUpdate: vi.fn().mockImplementation(async () => ({
        status: ApprovalRequestStatus.Pending,
        ...((await certificateDAL.findPendingRevocationApprovalRequest.mock.results.at(-1)?.value) as object)
      }))
    };
    const pkiApplicationDAL = { findById: vi.fn().mockResolvedValue({ id: "app-1", name: "web" }) };
    const licenseService = { getPlan: vi.fn().mockResolvedValue({ has: () => true }) };
    const signerDAL = { findOne: vi.fn().mockResolvedValue(undefined) };

    const deps = {
      certificateDAL,
      certificateAuthorityService,
      certificateAlertEventEmitter,
      auditLogService,
      approvalPolicyService,
      approvalRequestDAL,
      certificateAuthorityDAL,
      certificateAuthorityCrlDAL: { primaryNode: vi.fn() },
      internalCertificateAuthorityDAL: { update: vi.fn().mockResolvedValue([]) },
      keyStore: { acquireLock: vi.fn().mockRejectedValue(new Error("redis unavailable")) },
      certificateProfileDAL,
      certificateSyncDAL: { findPkiSyncIdsByCertificateId: vi.fn().mockResolvedValue([]) },
      pkiSyncDAL: { find: vi.fn().mockResolvedValue([]) },
      pkiSyncQueue: { queuePkiSyncLinkMatchingCertificates: vi.fn().mockResolvedValue(undefined) },
      pkiApplicationDAL,
      resourceMetadataDAL: { find: vi.fn().mockResolvedValue([]) },
      signerDAL,
      userDAL: {
        findById: vi.fn().mockResolvedValue({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" })
      },
      usageMeteringService: { emit: vi.fn() },
      projectDAL: { findById: vi.fn().mockResolvedValue({ id: "project-1", orgId: "org-1" }) },
      licenseService,
      telemetryService: { sendPostHogEvents: vi.fn().mockResolvedValue(undefined) },
      permissionService: {
        getResourcePermission: vi.fn().mockResolvedValue({ permission: createMongoAbility(applicationPermissions) })
      }
    } as unknown as TDeps;

    return {
      service: certificateServiceFactory(deps),
      certificateDAL,
      otherRecordsUpdate,
      certificateAuthorityDAL,
      certificateProfileDAL,
      certificateAuthorityService,
      certificateAlertEventEmitter,
      approvalPolicyService,
      approvalRequestDAL,
      auditLogService,
      pkiApplicationDAL,
      licenseService,
      signerDAL,
      storedCertificate: () => stored,
      auditEvents: () => auditLogService.createAuditLog.mock.calls.map(([log]) => (log as TAuditLog).event)
    };
  };

  const revokeRequest = { id: "cert-1", revocationReason: CrlReason.KEY_COMPROMISE, ...actor };

  describe("revokeCert", () => {
    it("opens an approval request with the requester's reason instead of revoking", async () => {
      const ctx = buildRevocationService();

      const result = await ctx.service.revokeCert(revokeRequest);

      expect(result).toMatchObject({
        status: CertificateRevocationStatus.PendingApproval,
        approvalRequestId: "approval-request-1",
        requesterName: "Ada Lovelace",
        requesterEmail: "ada@example.com",
        approvalPolicyId: "policy-1",
        approvalPolicyName: "prod-revocations",
        applicationName: "web"
      });
      expect(ctx.approvalPolicyService.createRequestFromPolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          requestData: expect.objectContaining({
            certificateId: "cert-1",
            revocationReason: CrlReason.KEY_COMPROMISE
          }) as unknown
        })
      );
      expect(ctx.storedCertificate().status).toBe(CertStatus.ACTIVE);
      expect(ctx.certificateAuthorityService.revokeCertificate).not.toHaveBeenCalled();
    });

    it("refuses to open a request for a certificate from a PQC CA once the license no longer includes PQC", async () => {
      const mlDsaCa = { ...internalCa, internalCa: { ...internalCa.internalCa, keyAlgorithm: "ML-DSA-65" } };
      const ctx = buildRevocationService({ ca: mlDsaCa });
      ctx.licenseService.getPlan.mockResolvedValue({ has: () => false });

      await expect(ctx.service.revokeCert(revokeRequest)).rejects.toThrow(
        "Your license does not include PQC algorithms."
      );
      expect(ctx.approvalPolicyService.createRequestFromPolicy).not.toHaveBeenCalled();
      expect(ctx.storedCertificate().status).toBe(CertStatus.ACTIVE);
    });

    it("refuses to open a request when another revocation committed after the certificate was read", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findByIdForUpdate.mockImplementationOnce(async () => ({
        ...ctx.storedCertificate(),
        status: CertStatus.REVOKED
      }));

      await expect(ctx.service.revokeCert(revokeRequest)).rejects.toThrow("is already revoked.");
      expect(ctx.approvalPolicyService.createRequestFromPolicy).not.toHaveBeenCalled();
    });

    it("refuses a certificate a code signing signer uses, even while the replica hasn't seen the signer", async () => {
      const ctx = buildRevocationService();
      ctx.signerDAL.findOne.mockImplementation(async (_filter: unknown, db?: unknown) =>
        db === primaryDb ? { id: "signer-1" } : undefined
      );

      await expect(ctx.service.revokeCert(revokeRequest)).rejects.toThrow(
        "This certificate is in use by a code signing signer. Revoke it from the signer instead."
      );
      expect(ctx.approvalPolicyService.createRequestFromPolicy).not.toHaveBeenCalled();
      expect(ctx.certificateAuthorityService.revokeCertificate).not.toHaveBeenCalled();
    });

    it("refuses a second request while one is still waiting for approval", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findPendingRevocationApprovalRequest.mockResolvedValue({
        id: "approval-request-0",
        expiresAt: new Date(Date.now() + 60_000)
      });

      await expect(ctx.service.revokeCert(revokeRequest)).rejects.toBeInstanceOf(BadRequestError);
      expect(ctx.approvalPolicyService.isPendingRequestUndecidable).toHaveBeenCalledWith("approval-request-0", tx);
      expect(ctx.approvalPolicyService.createRequestFromPolicy).not.toHaveBeenCalled();
      expect(ctx.approvalRequestDAL.update).not.toHaveBeenCalled();
      expect(ctx.storedCertificate().status).toBe(CertStatus.ACTIVE);
    });

    it("locks the pending request before reading whether its approvers can still approve it", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findPendingRevocationApprovalRequest.mockResolvedValue({
        id: "approval-request-0",
        expiresAt: new Date(Date.now() + 60_000)
      });

      await expect(ctx.service.revokeCert(revokeRequest)).rejects.toBeInstanceOf(BadRequestError);
      expect(ctx.approvalRequestDAL.findByIdForUpdate).toHaveBeenCalledWith("approval-request-0", tx);
      expect(ctx.approvalRequestDAL.findByIdForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
        ctx.approvalPolicyService.isPendingRequestUndecidable.mock.invocationCallOrder[0]
      );
    });

    it("refuses without replacing anything when the pending request was decided while waiting for its lock", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findPendingRevocationApprovalRequest.mockResolvedValue({
        id: "approval-request-0",
        expiresAt: null
      });
      ctx.approvalRequestDAL.findByIdForUpdate.mockResolvedValue({
        id: "approval-request-0",
        status: ApprovalRequestStatus.Approved,
        expiresAt: null
      });
      ctx.approvalPolicyService.isPendingRequestUndecidable.mockResolvedValue(true);

      await expect(ctx.service.revokeCert(revokeRequest)).rejects.toThrow(
        "An earlier revocation request for certificate 'web' was decided while you were making this one. Check the certificate's status and try again."
      );
      expect(ctx.approvalRequestDAL.update).not.toHaveBeenCalled();
      expect(ctx.approvalPolicyService.createRequestFromPolicy).not.toHaveBeenCalled();
    });

    describe("when the pending request's approvers can no longer approve it", () => {
      const stuckRequest = {
        ...approvedRevocation,
        id: "approval-request-0",
        type: ApprovalPolicyType.CertRevocation,
        status: ApprovalRequestStatus.Cancelled
      };

      const buildStuck = () => {
        const ctx = buildRevocationService();
        ctx.certificateDAL.findPendingRevocationApprovalRequest.mockResolvedValue({
          id: "approval-request-0",
          expiresAt: null
        });
        ctx.approvalPolicyService.isPendingRequestUndecidable.mockResolvedValue(true);
        ctx.approvalRequestDAL.update.mockResolvedValue([stuckRequest]);
        return ctx;
      };

      it("cancels it and opens a new request from the current policy", async () => {
        const ctx = buildStuck();

        const result = await ctx.service.revokeCert(revokeRequest);

        expect(ctx.approvalRequestDAL.update).toHaveBeenCalledWith(
          { id: "approval-request-0", status: ApprovalRequestStatus.Pending },
          { status: ApprovalRequestStatus.Cancelled },
          tx
        );
        expect(ctx.approvalPolicyService.createRequestFromPolicy).toHaveBeenCalledWith(
          expect.objectContaining({ policy: revocationPolicy, tx })
        );
        expect(result).toMatchObject({
          status: CertificateRevocationStatus.PendingApproval,
          approvalRequestId: "approval-request-1"
        });
        expect(ctx.storedCertificate().status).toBe(CertStatus.ACTIVE);
      });

      it("records the cancellation as Infisical's, with the reason and the original requester", async () => {
        const ctx = buildStuck();

        await ctx.service.revokeCert(revokeRequest);

        expect(ctx.auditLogService.createAuditLog).toHaveBeenCalledWith({
          projectId: "project-1",
          actor: { type: ActorType.PLATFORM, metadata: {} },
          event: {
            type: EventType.APPROVAL_REQUEST_CANCEL,
            metadata: {
              policyType: ApprovalPolicyType.CertRevocation,
              approvalRequestId: "approval-request-0",
              requesterName: "Ada Lovelace",
              requesterEmail: "requester@example.com",
              reason: "The request's approvers can no longer approve it, so a new revocation request replaced it.",
              certificateId: "cert-1",
              commonName: applicationCertificate.commonName,
              profileName: "web-servers"
            }
          }
        });
      });

      it("tells the requester it was decided meanwhile when cancelling finds it no longer pending", async () => {
        const ctx = buildStuck();
        ctx.approvalRequestDAL.update.mockResolvedValue([]);

        await expect(ctx.service.revokeCert(revokeRequest)).rejects.toThrow(
          new BadRequestError({
            message: `An earlier revocation request for certificate '${applicationCertificate.friendlyName}' was decided while you were making this one. Check the certificate's status and try again.`
          })
        );
        expect(ctx.approvalPolicyService.createRequestFromPolicy).not.toHaveBeenCalled();
        expect(ctx.auditLogService.createAuditLog).not.toHaveBeenCalled();
      });
    });

    it("refuses a thumbprint that matches more than one certificate in the organization", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findByThumbprintInOrg.mockResolvedValue([
        { ...applicationCertificate, id: "cert-1" },
        { ...applicationCertificate, id: "cert-2" }
      ]);

      await expect(
        ctx.service.revokeCert({ thumbprint: "ab".repeat(32), revocationReason: CrlReason.KEY_COMPROMISE, ...actor })
      ).rejects.toThrow(
        "Multiple certificates match the provided thumbprint. Revoke by certificate ID or serial number instead"
      );
      expect(ctx.approvalPolicyService.createRequestFromPolicy).not.toHaveBeenCalled();
      expect(ctx.certificateAuthorityService.revokeCertificate).not.toHaveBeenCalled();
    });

    it("revokes the active certificate when a thumbprint matches it and the deleted record it was re-imported from", async () => {
      const ctx = buildRevocationService();
      ctx.approvalPolicyService.matchPolicy.mockResolvedValue(null);
      ctx.certificateDAL.findByThumbprintInOrg.mockResolvedValue([
        { ...applicationCertificate, id: "cert-1" },
        { ...applicationCertificate, id: "cert-0", deletedAt: new Date("2026-10-01T00:00:00.000Z") }
      ]);

      const result = await ctx.service.revokeCert({
        thumbprint: "ab".repeat(32),
        revocationReason: CrlReason.KEY_COMPROMISE,
        ...actor
      });

      expect(result.status).toBe(CertificateRevocationStatus.Revoked);
      expect(ctx.certificateDAL.update).toHaveBeenCalledWith(
        { id: "cert-1" },
        expect.objectContaining({ status: CertStatus.REVOKED }),
        expect.anything()
      );
    });

    const deletedCertificate = { ...applicationCertificate, deletedAt: new Date("2026-10-01T00:00:00.000Z") };
    const reimportedCertificate = { ...applicationCertificate, id: "cert-2" };

    it("revokes the active copy when the deleted record of the same certificate is revoked", async () => {
      const ctx = buildRevocationService();
      ctx.approvalPolicyService.matchPolicy.mockResolvedValue(null);
      ctx.certificateDAL.findById.mockResolvedValue(deletedCertificate);
      ctx.certificateDAL.findSameCertificateRecords.mockResolvedValue([reimportedCertificate, deletedCertificate]);
      ctx.certificateDAL.findByIdForUpdate.mockResolvedValue(reimportedCertificate);

      const result = await ctx.service.revokeCert(revokeRequest);

      expect(result.status).toBe(CertificateRevocationStatus.Revoked);
      expect(ctx.certificateDAL.findSameCertificateRecords).toHaveBeenCalledWith(
        {
          serialNumbers: expect.arrayContaining([applicationCertificate.serialNumber]) as string[],
          caId: "ca-1",
          fingerprintSha256: deletedCertificate.fingerprintSha256
        },
        primaryDb
      );
      expect(ctx.certificateDAL.update).toHaveBeenCalledWith(
        { id: "cert-2" },
        expect.objectContaining({ status: CertStatus.REVOKED }),
        tx
      );
      expect(ctx.otherRecordsUpdate).toHaveBeenCalledWith(
        { $in: { id: [deletedCertificate.id] } },
        expect.objectContaining({ status: CertStatus.REVOKED, revocationReason: expect.any(Number) as number }),
        tx
      );
    });

    it("asks for approval under the active copy's policy when the deleted record is revoked", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findById.mockResolvedValue(deletedCertificate);
      ctx.certificateDAL.findSameCertificateRecords.mockResolvedValue([reimportedCertificate]);

      const result = await ctx.service.revokeCert(revokeRequest);

      expect(result.status).toBe(CertificateRevocationStatus.PendingApproval);
      expect(ctx.approvalPolicyService.createRequestFromPolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          requestData: expect.objectContaining({ certificateId: "cert-2" }) as unknown
        })
      );
      expect(ctx.certificateDAL.update).not.toHaveBeenCalled();
    });

    it("records every other record of the certificate it revokes in the audit log, under the serial lock", async () => {
      const ctx = buildRevocationService();
      ctx.approvalPolicyService.matchPolicy.mockResolvedValue(null);
      ctx.certificateDAL.findSameCertificateRecords.mockResolvedValue([{ ...deletedCertificate, id: "cert-0" }]);
      ctx.otherRecordsUpdate.mockResolvedValue([{ ...deletedCertificate, id: "cert-0" }]);

      await ctx.service.revokeCert(revokeRequest);

      expect(ctx.certificateDAL.lockSerialNumber).toHaveBeenCalledWith(applicationCertificate.serialNumber, tx);
      expect(ctx.certificateDAL.lockSerialNumber.mock.invocationCallOrder[0]).toBeLessThan(
        ctx.otherRecordsUpdate.mock.invocationCallOrder[0]
      );
      expect(ctx.auditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: { type: ActorType.PLATFORM, metadata: {} },
          event: expect.objectContaining({
            type: EventType.REVOKE_CERT,
            metadata: expect.objectContaining({
              certId: "cert-0",
              source: CertificateRevocationSource.SameCertificate,
              revokedThroughCertId: applicationCertificate.id,
              revokedThroughCertName: applicationCertificate.friendlyName
            }) as object
          }) as object
        })
      );
    });

    it("sends revocation alerts for another live record of the certificate it revokes", async () => {
      const ctx = buildRevocationService();
      ctx.approvalPolicyService.matchPolicy.mockResolvedValue(null);
      ctx.certificateDAL.findSameCertificateRecords.mockResolvedValue([{ ...applicationCertificate, id: "cert-3" }]);
      ctx.otherRecordsUpdate.mockResolvedValue([{ ...applicationCertificate, id: "cert-3" }]);

      await ctx.service.revokeCert(revokeRequest);

      expect(ctx.certificateAlertEventEmitter.notify).toHaveBeenCalledWith(
        expect.objectContaining({ certificateId: "cert-3" })
      );
    });

    it("refuses under the serial lock on an internal CA when the certificate is imported again while it is being revoked", async () => {
      const ctx = buildRevocationService({ ca: internalCa });
      ctx.approvalPolicyService.matchPolicy.mockResolvedValue(null);
      ctx.certificateDAL.findById.mockResolvedValue(deletedCertificate);
      ctx.certificateDAL.findByIdForUpdate.mockResolvedValue(deletedCertificate);
      ctx.certificateDAL.findSameCertificateRecords.mockImplementation(async (_filter: unknown, trx: unknown) =>
        trx === tx ? [reimportedCertificate] : []
      );

      await expect(ctx.service.revokeCert(revokeRequest)).rejects.toThrow(
        "was imported again while it was being revoked. Revoke it again so the imported certificate's permissions and approval policy apply."
      );
      expect(ctx.certificateDAL.update).not.toHaveBeenCalled();
    });

    it("revokes the copy imported mid-revocation once an external CA has already revoked the certificate", async () => {
      const ctx = buildRevocationService();
      ctx.approvalPolicyService.matchPolicy.mockResolvedValue(null);
      ctx.certificateDAL.findById.mockResolvedValue(deletedCertificate);
      ctx.certificateDAL.findByIdForUpdate.mockResolvedValue(deletedCertificate);
      ctx.certificateDAL.findSameCertificateRecords.mockImplementation(async (_filter: unknown, trx: unknown) =>
        trx === tx ? [reimportedCertificate] : []
      );
      ctx.otherRecordsUpdate.mockResolvedValue([reimportedCertificate]);

      const result = await ctx.service.revokeCert(revokeRequest);

      expect(result.status).toBe(CertificateRevocationStatus.Revoked);
      expect(ctx.certificateAuthorityService.revokeCertificate).toHaveBeenCalled();
      expect(ctx.otherRecordsUpdate).toHaveBeenCalled();
      expect(ctx.certificateAlertEventEmitter.notify).toHaveBeenCalledWith(
        expect.objectContaining({ certificateId: "cert-2" })
      );
    });

    it("revokes a deleted certificate that has no copy still on record", async () => {
      const ctx = buildRevocationService();
      ctx.approvalPolicyService.matchPolicy.mockResolvedValue(null);
      ctx.certificateDAL.findById.mockResolvedValue(deletedCertificate);
      ctx.certificateDAL.findByIdForUpdate.mockResolvedValue(deletedCertificate);

      const result = await ctx.service.revokeCert(revokeRequest);

      expect(result.status).toBe(CertificateRevocationStatus.Revoked);
      expect(ctx.certificateDAL.update).toHaveBeenCalledWith({ id: "cert-1" }, expect.anything(), tx);
    });

    it("refuses a thumbprint that matches only deleted certificates, more than one of them", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findByThumbprintInOrg.mockResolvedValue([
        { ...applicationCertificate, id: "cert-1", deletedAt: new Date("2026-10-02T00:00:00.000Z") },
        { ...applicationCertificate, id: "cert-0", deletedAt: new Date("2026-10-01T00:00:00.000Z") }
      ]);

      await expect(
        ctx.service.revokeCert({ thumbprint: "ab".repeat(32), revocationReason: CrlReason.KEY_COMPROMISE, ...actor })
      ).rejects.toThrow("Several deleted certificates match this thumbprint. Revoke by certificate ID instead.");
    });

    it.each([
      [
        "a step has nobody who can approve",
        [{ requiredApprovals: 1, approvers: [{ type: ApproverType.Group, id: "group-1" }], approverCount: 0 }],
        "Revocation approval policy 'prod-revocations' has no approvers who can approve on step 1, so nobody could approve this request. Ask an Application Admin to add approvers with an Admin or Operator role to the policy."
      ],
      [
        "a step requires more approvals than people who can approve it",
        [
          { requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: "user-2" }], approverCount: 1 },
          { requiredApprovals: 2, approvers: [{ type: ApproverType.Group, id: "group-1" }], approverCount: 1 }
        ],
        "Revocation approval policy 'prod-revocations' requires 2 approvals on step 2 but has only 1 approver who can approve, so this request could never be approved. Ask an Application Admin to add approvers or lower the step's required approvals."
      ]
    ])("refuses to open a request nobody could approve when %s", async (_label, steps, message) => {
      const ctx = buildRevocationService();
      ctx.approvalPolicyService.matchPolicy.mockResolvedValue({ ...revocationPolicy, steps });

      await expect(ctx.service.revokeCert(revokeRequest)).rejects.toThrow(new BadRequestError({ message }));
      expect(ctx.approvalPolicyService.createRequestFromPolicy).not.toHaveBeenCalled();
      expect(ctx.certificateAuthorityService.revokeCertificate).not.toHaveBeenCalled();
      expect(ctx.storedCertificate().status).toBe(CertStatus.ACTIVE);
    });

    it("opens a request when a group's members cover a step's required approvals", async () => {
      const ctx = buildRevocationService();
      ctx.approvalPolicyService.matchPolicy.mockResolvedValue({
        ...revocationPolicy,
        steps: [{ requiredApprovals: 3, approvers: [{ type: ApproverType.Group, id: "group-1" }], approverCount: 3 }]
      });

      await expect(ctx.service.revokeCert(revokeRequest)).resolves.toMatchObject({
        status: CertificateRevocationStatus.PendingApproval
      });
      expect(ctx.approvalPolicyService.createRequestFromPolicy).toHaveBeenCalled();
    });

    describe("when the pending request expires at this very moment", () => {
      const now = new Date("2026-11-16T12:00:00.000Z");

      beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(now);
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it("still treats it as waiting for approval, as the approval service does", async () => {
        const ctx = buildRevocationService();
        ctx.certificateDAL.findPendingRevocationApprovalRequest.mockResolvedValue({
          id: "approval-request-0",
          expiresAt: new Date(now)
        });

        const error = await ctx.service.revokeCert(revokeRequest).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestError);
        expect((error as Error).message).toBe(
          `A revocation of certificate '${applicationCertificate.friendlyName}' is already waiting for approval.`
        );
        expect(ctx.approvalRequestDAL.update).not.toHaveBeenCalled();
        expect(ctx.approvalPolicyService.createRequestFromPolicy).not.toHaveBeenCalled();
      });
    });

    it("expires a lapsed pending request and opens a new one", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findPendingRevocationApprovalRequest.mockResolvedValue({
        id: "approval-request-0",
        expiresAt: new Date(Date.now() - 60_000)
      });

      const result = await ctx.service.revokeCert(revokeRequest);

      expect(ctx.approvalRequestDAL.update).toHaveBeenCalledWith(
        { id: "approval-request-0", status: ApprovalRequestStatus.Pending },
        { status: ApprovalRequestStatus.Expired },
        tx
      );
      expect(ctx.approvalPolicyService.isPendingRequestUndecidable).not.toHaveBeenCalled();
      expect(ctx.auditLogService.createAuditLog).not.toHaveBeenCalled();
      expect(ctx.approvalPolicyService.createRequestFromPolicy).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(CertificateRevocationStatus.PendingApproval);
    });

    it("tells the requester the earlier request was decided meanwhile when expiring it finds it no longer pending", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findPendingRevocationApprovalRequest.mockResolvedValue({
        id: "approval-request-0",
        expiresAt: new Date(Date.now() - 60_000)
      });
      ctx.approvalRequestDAL.update.mockResolvedValue([]);

      await expect(ctx.service.revokeCert(revokeRequest)).rejects.toThrow(
        new BadRequestError({
          message: `An earlier revocation request for certificate '${applicationCertificate.friendlyName}' was decided while you were making this one. Check the certificate's status and try again.`
        })
      );
      expect(ctx.approvalPolicyService.createRequestFromPolicy).not.toHaveBeenCalled();
    });

    it("refuses a revocation request from an actor that is neither a user nor a machine identity", async () => {
      const ctx = buildRevocationService();

      await expect(ctx.service.revokeCert({ ...revokeRequest, actor: ActorType.PLATFORM })).rejects.toThrow(
        new BadRequestError({ message: "Only users and machine identities can request a certificate revocation" })
      );
      expect(ctx.approvalPolicyService.createRequestFromPolicy).not.toHaveBeenCalled();
      expect(ctx.certificateAuthorityService.revokeCertificate).not.toHaveBeenCalled();
      expect(ctx.storedCertificate().status).toBe(CertStatus.ACTIVE);
    });

    it("revokes immediately when no policy matches", async () => {
      const ctx = buildRevocationService();
      ctx.approvalPolicyService.matchPolicy.mockResolvedValue(null);

      const result = await ctx.service.revokeCert(revokeRequest);

      expect(result.status).toBe(CertificateRevocationStatus.Revoked);
      expect(ctx.storedCertificate().status).toBe(CertStatus.REVOKED);
      expect(ctx.certificateAuthorityService.revokeCertificate).toHaveBeenCalledWith(
        expect.objectContaining({ serialNumber: applicationCertificate.serialNumber })
      );
      expect(ctx.approvalPolicyService.createRequestFromPolicy).not.toHaveBeenCalled();
    });

    it("refuses a direct revocation when the certificate was revoked meanwhile, without writing it again", async () => {
      const ctx = buildRevocationService();
      ctx.approvalPolicyService.matchPolicy.mockResolvedValue(null);
      ctx.certificateDAL.findByIdForUpdate.mockResolvedValue({ ...applicationCertificate, status: CertStatus.REVOKED });

      const error = await ctx.service.revokeCert(revokeRequest).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestError);
      expect((error as Error).message).toBe(`Certificate '${applicationCertificate.friendlyName}' is already revoked.`);
      expect(ctx.certificateDAL.findByIdForUpdate).toHaveBeenCalledWith("cert-1", tx);
      expect(ctx.certificateDAL.update).not.toHaveBeenCalled();
    });

    it("reads the certificate and its profile from the primary to decide whether approval is needed", async () => {
      const ctx = buildRevocationService();

      await ctx.service.revokeCert(revokeRequest);

      expect(ctx.certificateDAL.findById).toHaveBeenCalledWith("cert-1", primaryDb);
      expect(ctx.certificateProfileDAL.findById).toHaveBeenCalledWith("profile-1", primaryDb);
    });
  });

  describe("revokeCert permissions", () => {
    const canOnlyRequest = [{ action: "request-revocation", subject: "certificates" }];
    const canRevoke = [{ action: "delete", subject: "certificates" }];
    const canNeither = [{ action: ["read", "list"], subject: "certificates" }];

    const isForbidden = (error: unknown) => error instanceof ForbiddenError || error instanceof ForbiddenRequestError;

    it("opens an approval request for an actor who can only request a revocation", async () => {
      const ctx = buildRevocationService({ applicationPermissions: canOnlyRequest });

      const result = await ctx.service.revokeCert(revokeRequest);

      expect(result.status).toBe(CertificateRevocationStatus.PendingApproval);
      expect(ctx.approvalPolicyService.createRequestFromPolicy).toHaveBeenCalledTimes(1);
      expect(ctx.storedCertificate().status).toBe(CertStatus.ACTIVE);
      expect(ctx.certificateAuthorityService.revokeCertificate).not.toHaveBeenCalled();
    });

    it("tells an actor who can only request a revocation that no policy covers the certificate and to ask an Application Admin", async () => {
      const ctx = buildRevocationService({ applicationPermissions: canOnlyRequest });
      ctx.approvalPolicyService.matchPolicy.mockResolvedValue(null);

      const error = await ctx.service.revokeCert(revokeRequest).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenRequestError);
      expect((error as Error).message).toBe(
        `Certificate '${applicationCertificate.friendlyName}' isn't covered by a revocation approval policy, so you need permission to revoke it directly. Ask an Application Admin to revoke it.`
      );
      expect(ctx.storedCertificate().status).toBe(CertStatus.ACTIVE);
      expect(ctx.certificateAuthorityService.revokeCertificate).not.toHaveBeenCalled();
      expect(ctx.approvalPolicyService.createRequestFromPolicy).not.toHaveBeenCalled();
    });

    it("opens an approval request for an actor who can revoke when a policy covers the certificate", async () => {
      const ctx = buildRevocationService({ applicationPermissions: canRevoke });

      const result = await ctx.service.revokeCert(revokeRequest);

      expect(result.status).toBe(CertificateRevocationStatus.PendingApproval);
      expect(ctx.storedCertificate().status).toBe(CertStatus.ACTIVE);
    });

    it("revokes for an actor who can revoke when no policy covers the certificate", async () => {
      const ctx = buildRevocationService({ applicationPermissions: canRevoke });
      ctx.approvalPolicyService.matchPolicy.mockResolvedValue(null);

      const result = await ctx.service.revokeCert(revokeRequest);

      expect(result.status).toBe(CertificateRevocationStatus.Revoked);
      expect(ctx.storedCertificate().status).toBe(CertStatus.REVOKED);
    });

    it("refuses an actor who can neither revoke nor request, the same way whether or not a policy applies", async () => {
      const covered = buildRevocationService({ applicationPermissions: canNeither });
      const uncovered = buildRevocationService({ applicationPermissions: canNeither });
      uncovered.approvalPolicyService.matchPolicy.mockResolvedValue(null);

      const coveredError = await covered.service.revokeCert(revokeRequest).catch((error: unknown) => error);
      const uncoveredError = await uncovered.service.revokeCert(revokeRequest).catch((error: unknown) => error);

      expect(isForbidden(coveredError)).toBe(true);
      expect((coveredError as Error).message).toBe((uncoveredError as Error).message);
      for (const ctx of [covered, uncovered]) {
        expect(ctx.storedCertificate().status).toBe(CertStatus.ACTIVE);
        expect(ctx.approvalPolicyService.createRequestFromPolicy).not.toHaveBeenCalled();
        expect(ctx.certificateAuthorityService.revokeCertificate).not.toHaveBeenCalled();
      }
    });
  });

  describe("revokeOwnedCertificate", () => {
    it("revokes a code signing signer's certificate, which the revoke route refuses", async () => {
      const ctx = buildRevocationService();
      ctx.signerDAL.findOne.mockResolvedValue({ id: "signer-1" });

      await ctx.service.revokeOwnedCertificate({
        certificateId: "cert-1",
        revocationReason: CrlReason.CESSATION_OF_OPERATION,
        orgId: "org-1"
      });

      expect(ctx.certificateAuthorityService.revokeCertificate).toHaveBeenCalled();
      expect(ctx.storedCertificate().status).toBe(CertStatus.REVOKED);
    });
  });

  describe("revokeApprovedCertificate", () => {
    it("revokes the certificate and records who requested it", async () => {
      const ctx = buildRevocationService();

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.storedCertificate().status).toBe(CertStatus.REVOKED);
      expect(ctx.auditEvents()).toEqual([
        expect.objectContaining({
          type: EventType.REVOKE_CERT,
          metadata: expect.objectContaining({
            certId: "cert-1",
            applicationId: "app-1",
            applicationName: "web",
            approvalRequestId: "approval-request-1",
            requesterName: "Ada Lovelace",
            requesterEmail: "requester@example.com"
          }) as unknown
        })
      ]);
    });

    it("names the CA and doesn't claim the certificate is still active when the CA fails unexpectedly", async () => {
      const ctx = buildRevocationService();
      ctx.certificateAuthorityService.revokeCertificate.mockRejectedValue(new Error("AWS PCA timed out"));

      await expect(ctx.service.revokeApprovedCertificate(approvedRevocation)).resolves.toBeUndefined();

      expect(ctx.storedCertificate().status).toBe(CertStatus.ACTIVE);
      expect(ctx.auditEvents()).toEqual([
        expect.objectContaining({
          type: EventType.CERT_REVOCATION_FAILED,
          metadata: expect.objectContaining({
            applicationId: "app-1",
            applicationName: "web",
            approvalRequestId: "approval-request-1",
            requesterName: "Ada Lovelace",
            requesterEmail: "requester@example.com",
            error:
              "Revoking the certificate at CA 'aws-pca' (AWS Private CA) failed with an unexpected error. Infisical hasn't marked the certificate as revoked and couldn't confirm its state at the CA. Check its status, and if Infisical shows it as active, request the revocation again with the same reason."
          }) as unknown
        })
      ]);
      const [failure] = ctx.auditEvents();
      expect(failure.metadata.error).not.toContain("still active");
    });

    it("refuses an approved request on a deleted record that was imported again, so the copy's policy applies", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findById.mockResolvedValue({
        ...applicationCertificate,
        deletedAt: new Date("2026-10-01T00:00:00.000Z")
      });
      ctx.certificateDAL.findSameCertificateRecords.mockResolvedValue([{ ...applicationCertificate, id: "cert-2" }]);

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.certificateAuthorityService.revokeCertificate).not.toHaveBeenCalled();
      expect(ctx.certificateDAL.update).not.toHaveBeenCalled();
      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(
        approvedRevocation,
        `Certificate '${applicationCertificate.friendlyName}' was deleted and imported again after this request was made. Request revocation of the imported certificate instead, so its approval policy applies.`
      );
    });

    it("passes on the CA's own message as a complete sentence", async () => {
      const adcsCa = { ...externalCa, name: "corp-adcs", externalCa: { id: "external-ca-2", type: CaType.ADCS } };
      const ctx = buildRevocationService({ ca: adcsCa });
      // The message the ADCS connection throws when its gateway can't be reached, verbatim: no trailing period.
      ctx.certificateAuthorityService.revokeCertificate.mockRejectedValue(
        new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" })
      );

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(
        approvedRevocation,
        "Revoking the certificate at CA 'corp-adcs' (Microsoft ADCS) failed: Unable to connect to gateway, no platform connection details found. Infisical hasn't marked the certificate as revoked."
      );
      const [[, reason]] = ctx.approvalPolicyService.notifyApprovedActionFailed.mock.calls as [unknown, string][];
      expect(reason).not.toContain("couldn't confirm");
    });

    it("doesn't blame the CA for a failure before Infisical called it", async () => {
      const ctx = buildRevocationService();
      ctx.certificateAuthorityDAL.findByIdWithAssociatedCa.mockRejectedValueOnce(
        new Error("Connection terminated unexpectedly")
      );

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.certificateAuthorityService.revokeCertificate).not.toHaveBeenCalled();
      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(
        approvedRevocation,
        "An unexpected error stopped the revocation. The certificate is still active."
      );
    });

    it("says the certificate is still active when an internal CA's revocation fails to save", async () => {
      const ctx = buildRevocationService({ ca: internalCa });
      ctx.certificateDAL.update.mockRejectedValue(new Error("Connection terminated unexpectedly"));

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.certificateAuthorityService.revokeCertificate).not.toHaveBeenCalled();
      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(
        approvedRevocation,
        "An unexpected error stopped the revocation. The certificate is still active."
      );
    });

    it("fails an approved revocation from a PQC CA once the license no longer includes PQC, and says the certificate is still active", async () => {
      const mlDsaCa = { ...internalCa, internalCa: { ...internalCa.internalCa, keyAlgorithm: "ML-DSA-65" } };
      const ctx = buildRevocationService({ ca: mlDsaCa });
      ctx.licenseService.getPlan.mockResolvedValue({ has: () => false });

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.storedCertificate().status).toBe(CertStatus.ACTIVE);
      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(
        approvedRevocation,
        "Your license does not include PQC algorithms. Please upgrade to the Enterprise plan to use a PQC algorithm. The certificate is still active."
      );
    });

    it("fails an approved revocation once a code signing signer uses the certificate, even while the replica hasn't seen the signer", async () => {
      const ctx = buildRevocationService();
      ctx.signerDAL.findOne.mockImplementation(async (_filter: unknown, db?: unknown) =>
        db === primaryDb ? { id: "signer-1" } : undefined
      );

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.certificateAuthorityService.revokeCertificate).not.toHaveBeenCalled();
      expect(ctx.storedCertificate().status).toBe(CertStatus.ACTIVE);
      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(
        approvedRevocation,
        "This certificate is in use by a code signing signer. Revoke it from the signer instead. The certificate is still active."
      );
    });

    it("says the CA accepted the revocation when only Infisical's record of it failed", async () => {
      const adcsCa = { ...externalCa, name: "corp-adcs", externalCa: { id: "external-ca-2", type: CaType.ADCS } };
      const ctx = buildRevocationService({ ca: adcsCa });
      ctx.certificateDAL.update.mockRejectedValue(new Error("Connection terminated unexpectedly"));

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.certificateAuthorityService.revokeCertificate).toHaveBeenCalledTimes(1);
      expect(ctx.storedCertificate().status).toBe(CertStatus.ACTIVE);
      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(
        approvedRevocation,
        "CA 'corp-adcs' (Microsoft ADCS) accepted the revocation, but Infisical couldn't record it. Request the revocation again with the same reason to record it."
      );
      expect(ctx.auditEvents()).toEqual([
        expect.objectContaining({
          type: EventType.CERT_REVOCATION_FAILED,
          metadata: expect.objectContaining({
            error:
              "CA 'corp-adcs' (Microsoft ADCS) accepted the revocation, but Infisical couldn't record it. Request the revocation again with the same reason to record it."
          }) as unknown
        })
      ]);
    });

    it("records nothing when the certificate was revoked meanwhile, after the CA accepted this revocation", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findByIdForUpdate.mockResolvedValue({ ...applicationCertificate, status: CertStatus.REVOKED });

      await expect(ctx.service.revokeApprovedCertificate(approvedRevocation)).resolves.toBeUndefined();

      expect(ctx.certificateAuthorityService.revokeCertificate).toHaveBeenCalledTimes(1);
      expect(ctx.certificateDAL.findByIdForUpdate).toHaveBeenCalledWith("cert-1", tx);
      expect(ctx.certificateDAL.update).not.toHaveBeenCalled();
      expect(ctx.auditEvents()).toEqual([]);
      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).not.toHaveBeenCalled();
    });

    it("reads the certificate's status from the primary after a failed revocation", async () => {
      const ctx = buildRevocationService();
      ctx.certificateAuthorityService.revokeCertificate.mockRejectedValue(new Error("AWS PCA timed out"));

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.certificateDAL.findById).toHaveBeenCalledTimes(2);
      expect(ctx.certificateDAL.findById).toHaveBeenNthCalledWith(1, "cert-1", primaryDb);
      expect(ctx.certificateDAL.findById).toHaveBeenNthCalledWith(2, "cert-1", primaryDb);
    });

    it("records nothing when the CA call fails but someone else revoked the certificate meanwhile", async () => {
      const adcsCa = { ...externalCa, name: "corp-adcs", externalCa: { id: "external-ca-2", type: CaType.ADCS } };
      const ctx = buildRevocationService({ ca: adcsCa });
      ctx.certificateAuthorityService.revokeCertificate.mockRejectedValue(
        new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" })
      );
      ctx.certificateDAL.findById
        .mockResolvedValueOnce(applicationCertificate)
        .mockResolvedValueOnce({ ...applicationCertificate, status: CertStatus.REVOKED });

      await expect(ctx.service.revokeApprovedCertificate(approvedRevocation)).resolves.toBeUndefined();

      expect(ctx.auditEvents()).toEqual([]);
      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).not.toHaveBeenCalled();
    });

    it("doesn't say the certificate is still active when it's gone after the failure", async () => {
      const ctx = buildRevocationService();
      ctx.certificateAuthorityService.revokeCertificate.mockRejectedValue(new Error("AWS PCA timed out"));
      ctx.certificateDAL.findById.mockResolvedValueOnce(applicationCertificate).mockResolvedValueOnce(undefined);

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(
        approvedRevocation,
        "Revoking the certificate at CA 'aws-pca' (AWS Private CA) failed with an unexpected error."
      );
    });

    it("says Infisical couldn't confirm whether the certificate was revoked when its status can't be read after the CA fails", async () => {
      const ctx = buildRevocationService();
      ctx.certificateAuthorityService.revokeCertificate.mockRejectedValue(new Error("AWS PCA timed out"));
      ctx.certificateDAL.findById
        .mockResolvedValueOnce(applicationCertificate)
        .mockRejectedValueOnce(new Error("Connection terminated unexpectedly"));
      const reason =
        "Infisical couldn't confirm whether the certificate was revoked. Check its status, and if it is still active, request the revocation again with the same reason.";

      await expect(ctx.service.revokeApprovedCertificate(approvedRevocation)).resolves.toBeUndefined();

      expect(ctx.auditEvents()).toEqual([
        expect.objectContaining({
          type: EventType.CERT_REVOCATION_FAILED,
          metadata: expect.objectContaining({
            certId: "cert-1",
            applicationId: "app-1",
            approvalRequestId: "approval-request-1",
            error: reason
          }) as unknown
        })
      ]);
      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledTimes(1);
      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(approvedRevocation, reason);
    });

    it("tells the requester and approvers once why the revocation failed", async () => {
      const ctx = buildRevocationService();
      ctx.certificateAuthorityService.revokeCertificate.mockRejectedValue(new Error("AWS PCA timed out"));

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledTimes(1);
      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(
        approvedRevocation,
        expect.stringMatching(/^Revoking the certificate at CA 'aws-pca' \(AWS Private CA\) failed/)
      );
    });

    it("sends no failure notice when the certificate is revoked", async () => {
      const ctx = buildRevocationService();

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.storedCertificate().status).toBe(CertStatus.REVOKED);
      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).not.toHaveBeenCalled();
    });

    it("sends no failure notice when the certificate was already revoked", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findById.mockResolvedValue({ ...applicationCertificate, status: CertStatus.REVOKED });

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.certificateAuthorityService.revokeCertificate).not.toHaveBeenCalled();
      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).not.toHaveBeenCalled();
    });

    it("keeps the recorded failure and doesn't throw when the failure notice can't be sent", async () => {
      const ctx = buildRevocationService();
      ctx.certificateAuthorityService.revokeCertificate.mockRejectedValue(new Error("AWS PCA timed out"));
      ctx.approvalPolicyService.notifyApprovedActionFailed.mockRejectedValue(new Error("notifications unavailable"));

      await expect(ctx.service.revokeApprovedCertificate(approvedRevocation)).resolves.toBeUndefined();

      expect(ctx.auditEvents().map((event) => event.type)).toEqual([EventType.CERT_REVOCATION_FAILED]);
    });

    it("records the revocation when a step after the CA and the local revoke fails", async () => {
      const ctx = buildRevocationService();
      ctx.certificateAlertEventEmitter.notify.mockRejectedValue(new Error("alert queue unavailable"));

      await expect(ctx.service.revokeApprovedCertificate(approvedRevocation)).resolves.toBeUndefined();

      expect(ctx.certificateAuthorityService.revokeCertificate).toHaveBeenCalledTimes(1);
      expect(ctx.storedCertificate().status).toBe(CertStatus.REVOKED);
      expect(ctx.auditEvents()).toEqual([
        expect.objectContaining({
          type: EventType.REVOKE_CERT,
          metadata: expect.objectContaining({ approvalRequestId: "approval-request-1" }) as unknown
        })
      ]);
    });

    it("identifies the certificate in the failure event when it can't be read", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findById.mockRejectedValue(new Error("connection terminated"));

      await expect(ctx.service.revokeApprovedCertificate(approvedRevocation)).resolves.toBeUndefined();

      expect(ctx.certificateAuthorityService.revokeCertificate).not.toHaveBeenCalled();
      expect(ctx.auditEvents()).toEqual([
        expect.objectContaining({
          type: EventType.CERT_REVOCATION_FAILED,
          metadata: expect.objectContaining({
            certId: "cert-1",
            cn: applicationCertificate.commonName,
            serialNumber: applicationCertificate.serialNumber,
            applicationId: "app-1",
            applicationName: "web",
            approvalRequestId: "approval-request-1"
          }) as unknown
        })
      ]);
    });

    it("identifies the certificate in the failure event when it no longer exists", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findById.mockResolvedValue(undefined);

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.auditEvents()).toEqual([
        expect.objectContaining({
          type: EventType.CERT_REVOCATION_FAILED,
          metadata: expect.objectContaining({
            certId: "cert-1",
            cn: applicationCertificate.commonName,
            serialNumber: applicationCertificate.serialNumber,
            applicationId: "app-1",
            applicationName: "web",
            error: `Certificate '${applicationCertificate.commonName}' no longer exists.`
          }) as unknown
        })
      ]);
    });

    it("names the certificate by its serial number when it no longer exists and has no common name", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findById.mockResolvedValue(undefined);
      const { requestData } = approvedRevocation.requestData as { requestData: Record<string, unknown> };
      const unnamedRevocation = {
        ...approvedRevocation,
        requestData: { version: 1, requestData: { ...requestData, commonName: "" } }
      } as unknown as TApprovalRequest;

      await ctx.service.revokeApprovedCertificate(unnamedRevocation);

      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(
        unnamedRevocation,
        `Certificate '${applicationCertificate.serialNumber}' no longer exists.`
      );
    });

    it("records the failure and notifies when the Application's name can't be read", async () => {
      const ctx = buildRevocationService();
      ctx.certificateAuthorityService.revokeCertificate.mockRejectedValue(
        new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" })
      );
      ctx.pkiApplicationDAL.findById.mockRejectedValue(new Error("Connection terminated unexpectedly"));

      await expect(ctx.service.revokeApprovedCertificate(approvedRevocation)).resolves.toBeUndefined();

      expect(ctx.auditEvents()).toEqual([
        expect.objectContaining({
          type: EventType.CERT_REVOCATION_FAILED,
          metadata: expect.objectContaining({ applicationId: "app-1", applicationName: null }) as unknown
        })
      ]);
      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledTimes(1);
    });

    it("still notifies, and doesn't throw, when the failure's audit event can't be written", async () => {
      const ctx = buildRevocationService();
      ctx.certificateAuthorityService.revokeCertificate.mockRejectedValue(new Error("AWS PCA timed out"));
      ctx.auditLogService.createAuditLog.mockRejectedValue(new Error("audit log unavailable"));

      await expect(ctx.service.revokeApprovedCertificate(approvedRevocation)).resolves.toBeUndefined();

      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledTimes(1);
    });

    it("records the CRL warning when the CRL couldn't be rebuilt", async () => {
      const ctx = buildRevocationService({ ca: internalCa });

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.storedCertificate().status).toBe(CertStatus.REVOKED);
      expect(ctx.auditEvents()).toContainEqual(
        expect.objectContaining({
          type: EventType.REVOKE_CERT,
          metadata: expect.objectContaining({ crlWarning: expect.stringContaining("CRL") as unknown }) as unknown
        })
      );
    });
  });
});

describe("certificate lookups by serial number", () => {
  const buildLookupService = () => {
    const certificateDAL = {
      findWithFullDetails: vi.fn().mockResolvedValue(undefined),
      findBySerialNumberInOrg: vi.fn().mockResolvedValue(undefined)
    };
    return { service: certificateServiceFactory({ certificateDAL } as unknown as TDeps), certificateDAL };
  };

  it("looks the certificate up only in the caller's organization", async () => {
    const { service, certificateDAL } = buildLookupService();

    await expect(service.getCert({ ...actor, serialNumber: "0a1b2c" })).rejects.toThrow(NotFoundError);
    await expect(service.getCertBody({ ...actor, serialNumber: "0a1b2c" })).rejects.toThrow(NotFoundError);

    expect(certificateDAL.findWithFullDetails).toHaveBeenCalledWith({ serialNumber: "0a1b2c", orgId: "org-1" });
    expect(certificateDAL.findBySerialNumberInOrg).toHaveBeenCalledWith({ orgId: "org-1", serialNumber: "0a1b2c" });
  });
});
