import { createMongoAbility, ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import { Knex } from "knex";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalRequest } from "@app/services/approval-policy/approval-policy-types";
import { ActorType } from "@app/services/auth/auth-type";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { IssuerType } from "@app/services/certificate-profile/certificate-profile-types";

import { certificateServiceFactory } from "./certificate-service";
import { CertificateRevocationStatus, CertStatus, CrlReason } from "./certificate-types";

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

  const revocationPolicy = { id: "policy-1", maxRequestTtl: null };

  const approvedRevocation = {
    id: "approval-request-1",
    projectId: "project-1",
    organizationId: "org-1",
    requesterId: "user-1",
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

  type TAuditLog = { event: { type: EventType; metadata: Record<string, unknown> } };

  const buildRevocationService = ({
    ca = externalCa as object,
    applicationPermissions = [{ action: "manage", subject: "all" }] as RawRuleOf<MongoAbility>[]
  } = {}) => {
    let stored: Record<string, unknown> = { ...applicationCertificate };
    const certificateDAL = {
      findById: vi.fn().mockImplementation(async () => stored),
      findByIdForUpdate: vi.fn().mockImplementation(async () => stored),
      update: vi.fn().mockImplementation(async (_filter: unknown, data: Record<string, unknown>) => {
        stored = { ...stored, ...data };
        return [stored];
      }),
      transaction: vi.fn().mockImplementation(async (run: (trx: Knex) => Promise<unknown>) => run(tx)),
      findPendingRevocationApprovalRequest: vi.fn().mockResolvedValue(undefined)
    };
    const certificateAuthorityService = { revokeCertificate: vi.fn().mockResolvedValue(undefined) };
    const certificateAlertEventEmitter = { notify: vi.fn().mockResolvedValue(undefined) };
    const auditLogService = { createAuditLog: vi.fn().mockResolvedValue(undefined) };
    const approvalPolicyService = {
      matchPolicy: vi.fn().mockResolvedValue(revocationPolicy),
      createRequestFromPolicy: vi.fn().mockResolvedValue({
        request: { id: "approval-request-1" },
        notifyApprovers: vi.fn().mockResolvedValue(undefined)
      }),
      notifyApprovedActionFailed: vi.fn().mockResolvedValue(undefined)
    };
    const approvalRequestDAL = { update: vi.fn().mockResolvedValue([{ id: "approval-request-0" }]) };

    const deps = {
      certificateDAL,
      certificateAuthorityService,
      certificateAlertEventEmitter,
      auditLogService,
      approvalPolicyService,
      approvalRequestDAL,
      certificateAuthorityDAL: { findByIdWithAssociatedCa: vi.fn().mockResolvedValue(ca) },
      certificateAuthorityCrlDAL: { primaryNode: vi.fn() },
      internalCertificateAuthorityDAL: { update: vi.fn().mockResolvedValue([]) },
      keyStore: { acquireLock: vi.fn().mockRejectedValue(new Error("redis unavailable")) },
      certificateProfileDAL: {
        findById: vi.fn().mockResolvedValue({ id: "profile-1", slug: "web-servers" })
      },
      certificateSyncDAL: { findPkiSyncIdsByCertificateId: vi.fn().mockResolvedValue([]) },
      pkiSyncDAL: { find: vi.fn().mockResolvedValue([]) },
      pkiSyncQueue: { queuePkiSyncLinkMatchingCertificates: vi.fn().mockResolvedValue(undefined) },
      pkiApplicationDAL: { findById: vi.fn().mockResolvedValue({ id: "app-1", name: "web" }) },
      resourceMetadataDAL: { find: vi.fn().mockResolvedValue([]) },
      userDAL: {
        findById: vi.fn().mockResolvedValue({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" })
      },
      usageMeteringService: { emit: vi.fn() },
      telemetryService: { sendPostHogEvents: vi.fn().mockResolvedValue(undefined) },
      permissionService: {
        getResourcePermission: vi.fn().mockResolvedValue({ permission: createMongoAbility(applicationPermissions) })
      }
    } as unknown as TDeps;

    return {
      service: certificateServiceFactory(deps),
      certificateDAL,
      certificateAuthorityService,
      certificateAlertEventEmitter,
      approvalPolicyService,
      approvalRequestDAL,
      auditLogService,
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
        approvalPolicyId: "policy-1"
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

    it("refuses a second request while one is still waiting for approval", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findPendingRevocationApprovalRequest.mockResolvedValue({
        id: "approval-request-0",
        expiresAt: new Date(Date.now() + 60_000)
      });

      await expect(ctx.service.revokeCert(revokeRequest)).rejects.toBeInstanceOf(BadRequestError);
      expect(ctx.approvalPolicyService.createRequestFromPolicy).not.toHaveBeenCalled();
      expect(ctx.approvalRequestDAL.update).not.toHaveBeenCalled();
      expect(ctx.storedCertificate().status).toBe(CertStatus.ACTIVE);
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
      expect(ctx.approvalPolicyService.createRequestFromPolicy).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(CertificateRevocationStatus.PendingApproval);
    });

    it("refuses to open a request when the lapsed one was decided while it was being expired", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findPendingRevocationApprovalRequest.mockResolvedValue({
        id: "approval-request-0",
        expiresAt: new Date(Date.now() - 60_000)
      });
      ctx.approvalRequestDAL.update.mockResolvedValue([]);

      const error = await ctx.service.revokeCert(revokeRequest).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestError);
      expect((error as Error).message).toContain(`'${applicationCertificate.friendlyName}'`);
      expect((error as Error).message).toContain("Check the certificate's status and try again");
      expect(ctx.approvalPolicyService.createRequestFromPolicy).not.toHaveBeenCalled();
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

    it("refuses an actor who can only request a revocation when no policy covers the certificate", async () => {
      const ctx = buildRevocationService({ applicationPermissions: canOnlyRequest });
      ctx.approvalPolicyService.matchPolicy.mockResolvedValue(null);

      await expect(ctx.service.revokeCert(revokeRequest)).rejects.toSatisfy(isForbidden);
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

  describe("revokeApprovedCertificate", () => {
    it("revokes the certificate and records who approved it", async () => {
      const ctx = buildRevocationService();

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.storedCertificate().status).toBe(CertStatus.REVOKED);
      expect(ctx.auditEvents()).toEqual([
        expect.objectContaining({
          type: EventType.REVOKE_CERT,
          metadata: expect.objectContaining({ certId: "cert-1", approvalRequestId: "approval-request-1" }) as unknown
        })
      ]);
    });

    it("records that the certificate is still active when the certificate authority refuses", async () => {
      const ctx = buildRevocationService();
      ctx.certificateAuthorityService.revokeCertificate.mockRejectedValue(new Error("AWS PCA timed out"));

      await expect(ctx.service.revokeApprovedCertificate(approvedRevocation)).resolves.toBeUndefined();

      expect(ctx.storedCertificate().status).toBe(CertStatus.ACTIVE);
      expect(ctx.auditEvents()).toEqual([
        expect.objectContaining({
          type: EventType.CERT_REVOCATION_FAILED,
          metadata: expect.objectContaining({
            approvalRequestId: "approval-request-1",
            error: "An unexpected error stopped the revocation. The certificate is still active."
          }) as unknown
        })
      ]);
    });

    it("passes on why the revocation was refused and that the certificate is still active", async () => {
      const ctx = buildRevocationService();
      ctx.certificateAuthorityService.revokeCertificate.mockRejectedValue(
        new BadRequestError({ message: "The CA doesn't accept this revocation reason." })
      );

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(
        approvedRevocation,
        "The CA doesn't accept this revocation reason. The certificate is still active."
      );
    });

    it("doesn't say the certificate is still active when it's gone after the failure", async () => {
      const ctx = buildRevocationService();
      ctx.certificateAuthorityService.revokeCertificate.mockRejectedValue(new Error("AWS PCA timed out"));
      ctx.certificateDAL.findById.mockResolvedValueOnce(applicationCertificate).mockResolvedValueOnce(undefined);

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(
        approvedRevocation,
        "An unexpected error stopped the revocation."
      );
    });

    it("tells the requester and approvers once why the revocation failed", async () => {
      const ctx = buildRevocationService();
      ctx.certificateAuthorityService.revokeCertificate.mockRejectedValue(new Error("AWS PCA timed out"));

      await ctx.service.revokeApprovedCertificate(approvedRevocation);

      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledTimes(1);
      expect(ctx.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(
        approvedRevocation,
        expect.stringMatching(/unexpected error stopped the revocation/)
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

    it("records the revocation when a step after the local revoke fails", async () => {
      const ctx = buildRevocationService();
      ctx.certificateAlertEventEmitter.notify.mockRejectedValue(new Error("alert queue unavailable"));

      await expect(ctx.service.revokeApprovedCertificate(approvedRevocation)).resolves.toBeUndefined();

      expect(ctx.storedCertificate().status).toBe(CertStatus.REVOKED);
      expect(ctx.auditEvents()).toEqual([
        expect.objectContaining({
          type: EventType.REVOKE_CERT,
          metadata: expect.objectContaining({ approvalRequestId: "approval-request-1" }) as unknown
        })
      ]);
    });

    it("records the failure instead of throwing when the certificate can't be read", async () => {
      const ctx = buildRevocationService();
      ctx.certificateDAL.findById.mockRejectedValue(new Error("connection terminated"));

      await expect(ctx.service.revokeApprovedCertificate(approvedRevocation)).resolves.toBeUndefined();

      expect(ctx.certificateAuthorityService.revokeCertificate).not.toHaveBeenCalled();
      expect(ctx.auditEvents()).toEqual([
        expect.objectContaining({
          type: EventType.CERT_REVOCATION_FAILED,
          metadata: expect.objectContaining({ approvalRequestId: "approval-request-1" }) as unknown
        })
      ]);
    });

    it("does not throw when the audit log can't be written", async () => {
      const ctx = buildRevocationService();
      ctx.certificateAuthorityService.revokeCertificate.mockRejectedValue(new Error("AWS PCA timed out"));
      ctx.auditLogService.createAuditLog.mockRejectedValue(new Error("audit log unavailable"));

      await expect(ctx.service.revokeApprovedCertificate(approvedRevocation)).resolves.toBeUndefined();
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
