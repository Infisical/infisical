import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import {
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { rebuildCaCrl } from "@app/services/certificate-authority/certificate-authority-fns";

import { certificateAuthorityCrlServiceFactory } from "./certificate-authority-crl-service";

vi.mock("@app/services/certificate-authority/certificate-authority-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/certificate-authority/certificate-authority-fns")>()),
  rebuildCaCrl: vi.fn(async () => ({ id: "crl-1", thisUpdate: new Date(), nextUpdate: new Date(), crlNumber: 2 }))
}));

const CA_ID = "ca-1";
const CA_NAME = "root-ca";

const actorFields = {
  caId: CA_ID,
  actor: ActorType.USER,
  actorId: "user-1",
  actorAuthMethod: AuthMethod.EMAIL,
  actorOrgId: "org-1"
};

const editRule = (conditions?: Record<string, unknown>) => ({
  action: ProjectPermissionCertificateAuthorityActions.Edit,
  subject: ProjectPermissionSub.CertificateAuthorities,
  ...(conditions && { conditions })
});

const buildService = ({
  ca = {
    id: CA_ID,
    name: CA_NAME,
    projectId: "project-1",
    internalCa: { id: "internal-1", activeCaCertId: "ca-cert-1", notAfter: new Date(Date.now() + 86_400_000) }
  } as Record<string, unknown> | null,
  rules = [editRule()] as Record<string, unknown>[],
  plan = { caCrl: true },
  caOrgId = "org-1"
} = {}) =>
  certificateAuthorityCrlServiceFactory({
    certificateAuthorityDAL: { findByIdWithAssociatedCa: vi.fn(async () => ca) },
    permissionService: {
      getProjectPermission: vi.fn(async () => ({ permission: createMongoAbility(rules as never) }))
    },
    projectDAL: { findById: vi.fn(async () => ({ id: "project-1", orgId: caOrgId })) },
    licenseService: { getPlan: vi.fn(async () => plan) },
    certificateAuthorityCrlDAL: {},
    certificateAuthoritySecretDAL: {},
    certificateDAL: {},
    kmsService: {},
    caKeySourceService: {},
    keyStore: {}
  } as never);

describe("certificateAuthorityCrlService.rebuildCrl", () => {
  test("rebuilds when the actor can edit the CA and the plan includes CRLs", async () => {
    vi.mocked(rebuildCaCrl).mockClear();
    const result = await buildService({ rules: [editRule({ name: CA_NAME })] }).rebuildCrl(actorFields);

    expect(rebuildCaCrl).toHaveBeenCalledTimes(1);
    expect(result.crl.crlNumber).toBe(2);
  });

  test("refuses a CA that is not internal", async () => {
    vi.mocked(rebuildCaCrl).mockClear();
    const service = buildService({ ca: { id: CA_ID, name: CA_NAME, projectId: "project-1", internalCa: undefined } });

    await expect(service.rebuildCrl(actorFields)).rejects.toBeInstanceOf(NotFoundError);
    expect(rebuildCaCrl).not.toHaveBeenCalled();
  });

  test("answers a CA in another organization the same as an unknown one", async () => {
    vi.mocked(rebuildCaCrl).mockClear();
    const service = buildService({ caOrgId: "org-2" });

    await expect(service.rebuildCrl(actorFields)).rejects.toBeInstanceOf(NotFoundError);
    expect(rebuildCaCrl).not.toHaveBeenCalled();
  });

  test("refuses an actor whose edit permission covers other CAs only", async () => {
    vi.mocked(rebuildCaCrl).mockClear();
    const service = buildService({ rules: [editRule({ name: "other-ca" })] });

    await expect(service.rebuildCrl(actorFields)).rejects.toBeInstanceOf(ForbiddenError);
    expect(rebuildCaCrl).not.toHaveBeenCalled();
  });

  test("refuses an actor who can only read CAs", async () => {
    vi.mocked(rebuildCaCrl).mockClear();
    const service = buildService({
      rules: [
        {
          action: ProjectPermissionCertificateAuthorityActions.Read,
          subject: ProjectPermissionSub.CertificateAuthorities
        }
      ]
    });

    await expect(service.rebuildCrl(actorFields)).rejects.toBeInstanceOf(ForbiddenError);
    expect(rebuildCaCrl).not.toHaveBeenCalled();
  });

  test("refuses a CA that has no certificate yet", async () => {
    vi.mocked(rebuildCaCrl).mockClear();
    const service = buildService({
      ca: { id: CA_ID, name: CA_NAME, projectId: "project-1", internalCa: { id: "internal-1", activeCaCertId: null } }
    });

    await expect(service.rebuildCrl(actorFields)).rejects.toBeInstanceOf(BadRequestError);
    expect(rebuildCaCrl).not.toHaveBeenCalled();
  });

  test("refuses a CA whose certificate has expired", async () => {
    vi.mocked(rebuildCaCrl).mockClear();
    const service = buildService({
      ca: {
        id: CA_ID,
        name: CA_NAME,
        projectId: "project-1",
        internalCa: { id: "internal-1", activeCaCertId: "ca-cert-1", notAfter: new Date(Date.now() - 1000) }
      }
    });

    await expect(service.rebuildCrl(actorFields)).rejects.toBeInstanceOf(BadRequestError);
    expect(rebuildCaCrl).not.toHaveBeenCalled();
  });

  test("refuses a plan without CRLs", async () => {
    vi.mocked(rebuildCaCrl).mockClear();
    const service = buildService({ plan: { caCrl: false } });

    await expect(service.rebuildCrl(actorFields)).rejects.toBeInstanceOf(BadRequestError);
    expect(rebuildCaCrl).not.toHaveBeenCalled();
  });
});
