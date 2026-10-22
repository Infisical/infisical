import { createMongoAbility } from "@casl/ability";
import { Knex } from "knex";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { ActorType } from "@app/services/auth/auth-type";

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
  const certificateSyncDAL = { delete: vi.fn().mockResolvedValue([]) };
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

  it("keeps the row, stamps who deleted it, and removes its material, collection items and sync links", async () => {
    ctx.certificateSyncDAL.delete.mockResolvedValue([{ pkiSyncId: "sync-1" }, { pkiSyncId: "sync-1" }]);

    const result = await ctx.service.deleteCert({
      id: "cert-1",
      ...actor,
      auditLogInfo: { userAgentType: UserAgentType.TERRAFORM } as never
    });

    expect(ctx.certificateDAL.update).toHaveBeenCalledWith(
      { id: "cert-1" },
      expect.objectContaining({
        deletedByActorType: ActorType.USER,
        deletedByActorId: "user-1",
        deletedVia: UserAgentType.TERRAFORM,
        deletedAt: expect.any(Date) as Date
      }),
      tx
    );
    expect(ctx.certificateBodyDAL.delete).toHaveBeenCalledWith({ certId: "cert-1" }, tx);
    expect(ctx.certificateSecretDAL.delete).toHaveBeenCalledWith({ certId: "cert-1" }, tx);
    expect(ctx.pkiCollectionItemDAL.delete).toHaveBeenCalledWith({ certId: "cert-1" }, tx);
    expect(ctx.certificateSyncDAL.delete).toHaveBeenCalledWith({ certificateId: "cert-1" }, tx);
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
