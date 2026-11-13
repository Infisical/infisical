import { webcrypto } from "node:crypto";

import { createMongoAbility, ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import { describe, expect, test, vi } from "vitest";

import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";
import {
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { buildLocalCaSigner } from "@app/services/certificate-authority/ca-signer";
import { CaCrlRegenerationTrigger } from "@app/services/certificate-authority/certificate-authority-enums";
import { rebuildCaCrl } from "@app/services/certificate-authority/certificate-authority-fns";

import { certificateAuthorityCrlServiceFactory } from "./certificate-authority-crl-service";

vi.mock("@app/services/certificate-authority/certificate-authority-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/certificate-authority/certificate-authority-fns")>()),
  rebuildCaCrl: vi.fn(async () => ({
    id: "crl-1",
    thisUpdate: new Date(),
    nextUpdate: new Date(),
    crlNumber: 2,
    crl: "-----BEGIN X509 CRL-----"
  }))
}));

const CA_ID = "ca-1";
const CA_NAME = "root-ca";

const auditLogInfo = {
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
  actor: {
    type: ActorType.USER as const,
    metadata: { userId: "user-1", username: "john.smith", email: "john.smith@example.com" }
  }
};

const actorFields = {
  caId: CA_ID,
  actor: ActorType.USER,
  actorId: "user-1",
  actorAuthMethod: AuthMethod.EMAIL,
  actorOrgId: "org-1",
  auditLogInfo
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
  caOrgId = "org-1",
  storedCrls = [] as { id: string; encryptedCrl: Buffer; nextUpdate: Date }[]
} = {}) =>
  certificateAuthorityCrlServiceFactory({
    certificateAuthorityDAL: { findByIdWithAssociatedCa: vi.fn(async () => ca) },
    permissionService: {
      getProjectPermission: vi.fn(async () => ({ permission: createMongoAbility(rules as never) }))
    },
    projectDAL: {
      findById: vi.fn(async () => ({ id: "project-1", orgId: caOrgId })),
      findOne: vi.fn(async () => ({ id: "project-1", orgId: caOrgId, kmsCertificateKeyId: "kms-1" })),
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({}))
    },
    licenseService: { getPlan: vi.fn(async () => Plan.restore({ ...testFeatures(), ...plan })) },
    certificateAuthorityCrlDAL: { find: vi.fn(async () => storedCrls) },
    certificateAuthoritySecretDAL: {},
    certificateDAL: {},
    kmsCoreDomain: {
      decryptWithKmsKey: vi.fn(
        async () =>
          async ({ cipherTextBlob }: { cipherTextBlob: Buffer }) =>
            cipherTextBlob
      )
    },
    caKeySourceService: {},
    keyStore: {},
    auditLogService: {}
  } as never);

describe("certificateAuthorityCrlService.regenerateCrl", () => {
  test("regenerates as a manual trigger audited as the actor when the actor can edit the CA", async () => {
    vi.mocked(rebuildCaCrl).mockClear();
    const result = await buildService({ rules: [editRule({ name: CA_NAME })] }).regenerateCrl(actorFields);

    expect(rebuildCaCrl).toHaveBeenCalledTimes(1);
    expect(rebuildCaCrl).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: CaCrlRegenerationTrigger.Manual, auditLogInfo })
    );
    expect(result.crl.crlNumber).toBe(2);
  });

  test("refuses a CA that is not internal", async () => {
    vi.mocked(rebuildCaCrl).mockClear();
    const service = buildService({ ca: { id: CA_ID, name: CA_NAME, projectId: "project-1", internalCa: undefined } });

    await expect(service.regenerateCrl(actorFields)).rejects.toBeInstanceOf(NotFoundError);
    expect(rebuildCaCrl).not.toHaveBeenCalled();
  });

  test("answers a CA in another organization the same as an unknown one", async () => {
    vi.mocked(rebuildCaCrl).mockClear();
    const service = buildService({ caOrgId: "org-2" });

    await expect(service.regenerateCrl(actorFields)).rejects.toBeInstanceOf(NotFoundError);
    expect(rebuildCaCrl).not.toHaveBeenCalled();
  });

  test("refuses an actor whose edit permission covers other CAs only", async () => {
    vi.mocked(rebuildCaCrl).mockClear();
    const service = buildService({ rules: [editRule({ name: "other-ca" })] });

    await expect(service.regenerateCrl(actorFields)).rejects.toBeInstanceOf(ForbiddenError);
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

    await expect(service.regenerateCrl(actorFields)).rejects.toBeInstanceOf(ForbiddenError);
    expect(rebuildCaCrl).not.toHaveBeenCalled();
  });

  test("refuses a CA that has no certificate yet", async () => {
    vi.mocked(rebuildCaCrl).mockClear();
    const service = buildService({
      ca: { id: CA_ID, name: CA_NAME, projectId: "project-1", internalCa: { id: "internal-1", activeCaCertId: null } }
    });

    await expect(service.regenerateCrl(actorFields)).rejects.toBeInstanceOf(BadRequestError);
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

    await expect(service.regenerateCrl(actorFields)).rejects.toBeInstanceOf(BadRequestError);
    expect(rebuildCaCrl).not.toHaveBeenCalled();
  });

  test("refuses a plan without CRLs", async () => {
    vi.mocked(rebuildCaCrl).mockClear();
    const service = buildService({ plan: { caCrl: false } });

    await expect(service.regenerateCrl(actorFields)).rejects.toBeInstanceOf(BadRequestError);
    expect(rebuildCaCrl).not.toHaveBeenCalled();
  });
});

describe("certificateAuthorityCrlService.getCaCrls", () => {
  test("reads the dates from a legacy CRL without a CRL Number and reports its number as null", async () => {
    x509.cryptoProvider.set(webcrypto as unknown as Crypto);
    const caKeys = (await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify"
    ])) as CryptoKeyPair;
    const signer = buildLocalCaSigner({ ...caKeys, signingAlgorithm: { name: "ECDSA", hash: "SHA-256" } as Algorithm });
    const thisUpdate = new Date("2026-01-01T00:00:00.000Z");
    const nextUpdate = new Date("2026-01-08T00:00:00.000Z");
    const legacyCrl = await signer.createCrl({ issuer: "CN=Legacy CA", thisUpdate, nextUpdate, entries: [] });
    const service = buildService({
      rules: [
        {
          action: ProjectPermissionCertificateAuthorityActions.Read,
          subject: ProjectPermissionSub.CertificateAuthorities
        }
      ],
      storedCrls: [
        { id: "crl-1", encryptedCrl: Buffer.from(legacyCrl.rawData), nextUpdate: new Date("2026-06-01T00:00:00.000Z") }
      ]
    });

    const { crls } = await service.getCaCrls(actorFields);

    expect(crls).toEqual([expect.objectContaining({ id: "crl-1", crlNumber: null, thisUpdate, nextUpdate })]);
  });
});
