import { createMongoAbility } from "@casl/ability";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IdentityAuthMethod } from "@app/db/schemas";
import { testLDAPConfig } from "@app/ee/services/ldap-config/ldap-fns";
import { ConflictError } from "@app/lib/errors";

import { identityLdapAuthServiceFactory } from "./identity-ldap-auth-service";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ isDevelopmentMode: false, ALLOW_INTERNAL_IP_CONNECTIONS: false })
}));

vi.mock("../super-admin/super-admin-fns", () => ({
  validateIdentityUpdateForSuperAdminPrivileges: vi.fn()
}));

vi.mock("@app/ee/services/ldap-config/ldap-fns", () => ({
  testLDAPConfig: vi.fn().mockResolvedValue(true)
}));

const ORG_ID = "org-id";
const IDENTITY_ID = "identity-id";
const TEMPLATE_ID = "template-id";
// a literal IP keeps the suite hermetic: blockLocalAndPrivateIpAddresses skips the DNS lookup
const LDAP_URL = "ldap://8.8.8.8";

const createService = ({ identityAuthMethods = [] as string[] }: { identityAuthMethods?: string[] } = {}) => {
  const templateRow = {
    id: TEMPLATE_ID,
    orgId: ORG_ID,
    name: "auth-template",
    authMethod: "ldap",
    // the fake cipher pair below round-trips plaintext, so the "encrypted" blob is the JSON
    templateFields: Buffer.from(
      JSON.stringify({ url: LDAP_URL, bindDN: "cn=admin", bindPass: "pw", searchBase: "dc=example" })
    ),
    updatedAt: new Date("2026-10-01T00:00:00Z")
  };

  const storedAuthRow = {
    id: "ldap-auth-id",
    identityId: IDENTITY_ID,
    templateId: TEMPLATE_ID,
    url: LDAP_URL,
    searchBase: "dc=example",
    searchFilter: "(uid={{username}})",
    encryptedBindDN: Buffer.from("cn=admin"),
    encryptedBindPass: Buffer.from("pw"),
    encryptedLdapCaCertificate: null,
    allowedFields: null,
    accessTokenTTL: 7200,
    accessTokenMaxTTL: 7200,
    accessTokenNumUsesLimit: 0,
    accessTokenTrustedIps: []
  };

  const identityLdapAuthDAL = {
    create: vi.fn().mockImplementation((data: Record<string, unknown>) => ({ id: "ldap-auth-id", ...data })),
    findOne: vi.fn().mockResolvedValue(storedAuthRow),
    updateById: vi.fn().mockImplementation((id: string, data: Record<string, unknown>) => ({
      ...storedAuthRow,
      ...data
    })),
    delete: vi.fn(),
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({ marker: "tx" }))
  };

  const identityAuthTemplateDAL = {
    findByIdAndOrgId: vi.fn().mockResolvedValue(templateRow),
    findByIdForShare: vi.fn().mockResolvedValue(templateRow)
  };

  const service = identityLdapAuthServiceFactory({
    identityAccessTokenDAL: { delete: vi.fn() },
    identityDAL: { findById: vi.fn(), findOne: vi.fn().mockResolvedValue({ id: IDENTITY_ID }) },
    identityLdapAuthDAL,
    membershipIdentityDAL: {
      findOne: vi.fn().mockResolvedValue({ scopeOrgId: ORG_ID }),
      update: vi.fn(),
      getIdentityById: vi.fn().mockResolvedValue({
        scopeOrgId: ORG_ID,
        identity: { id: IDENTITY_ID, orgId: ORG_ID, projectId: null, authMethods: identityAuthMethods }
      })
    },
    licenseService: {
      getPlan: vi.fn().mockResolvedValue({ ldap: true, machineIdentityAuthTemplates: true, ipAllowlisting: true })
    },
    permissionService: {
      getOrgPermission: vi
        .fn()
        .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) }),
      getProjectPermission: vi.fn(),
      getActorGrantAbilities: vi.fn().mockResolvedValue([])
    },
    kmsService: {
      createCipherPairWithDataKey: vi.fn().mockResolvedValue({
        encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText }),
        decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
      })
    },
    identityAuthTemplateDAL,
    keyStore: {},
    orgDAL: {
      findById: vi.fn().mockResolvedValue({ id: ORG_ID, shouldUseNewPrivilegeSystem: true }),
      findOne: vi.fn(),
      findEffectiveOrgMembership: vi.fn()
    },
    identityAccessTokenService: {
      issueIdentityAccessToken: vi.fn(),
      revokeTokensForIdentityAuthMethod: vi.fn(),
      invalidateTrustedIpsCache: vi.fn()
    },
    eventEmitter: { emit: vi.fn() }
  } as unknown as Parameters<typeof identityLdapAuthServiceFactory>[0]);

  return { service, identityLdapAuthDAL, identityAuthTemplateDAL, templateRow };
};

const baseActor = {
  actor: "user",
  actorId: "actor-id",
  actorAuthMethod: undefined,
  actorOrgId: ORG_ID
};

const attachWithTemplate = (service: ReturnType<typeof createService>["service"]) =>
  service.attachLdapAuth({
    ...baseActor,
    identityId: IDENTITY_ID,
    templateId: TEMPLATE_ID,
    searchFilter: "(uid={{username}})",
    accessTokenTTL: 7200,
    accessTokenMaxTTL: 7200,
    accessTokenNumUsesLimit: 0,
    accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }]
  } as unknown as Parameters<typeof service.attachLdapAuth>[0]);

describe("identityLdapAuthServiceFactory template lock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tests the LDAP connection before the transaction opens and locks the template before inserting", async () => {
    const { service, identityLdapAuthDAL, identityAuthTemplateDAL, templateRow } = createService();
    const order: string[] = [];
    vi.mocked(testLDAPConfig).mockImplementation(async () => {
      order.push("ldap-test");
      return true;
    });
    identityLdapAuthDAL.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      order.push("begin");
      return cb({ marker: "tx" });
    });
    identityAuthTemplateDAL.findByIdForShare.mockImplementation(async (_id: string, tx: { marker: string }) => {
      order.push(`lock:${tx.marker}`);
      return templateRow;
    });
    identityLdapAuthDAL.create.mockImplementation(async (data: Record<string, unknown>) => {
      order.push("create");
      return { id: "ldap-auth-id", ...data };
    });

    await attachWithTemplate(service);

    expect(order).toEqual(["ldap-test", "begin", "lock:tx", "create"]);
    expect(identityLdapAuthDAL.create).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: TEMPLATE_ID, url: LDAP_URL }),
      expect.anything()
    );
  });

  it("rejects an attach when the template was edited after it was validated", async () => {
    const { service, identityLdapAuthDAL, identityAuthTemplateDAL, templateRow } = createService();
    identityAuthTemplateDAL.findByIdForShare.mockResolvedValue({
      ...templateRow,
      updatedAt: new Date("2026-10-01T00:00:01Z")
    });

    await expect(attachWithTemplate(service)).rejects.toBeInstanceOf(ConflictError);
    expect(identityLdapAuthDAL.create).not.toHaveBeenCalled();
  });

  it("locks on update whenever a template is named, since LDAP copies its values on a re-assert too", async () => {
    const { service, identityLdapAuthDAL, identityAuthTemplateDAL, templateRow } = createService({
      identityAuthMethods: [IdentityAuthMethod.LDAP_AUTH]
    });
    identityAuthTemplateDAL.findByIdForShare.mockResolvedValue({
      ...templateRow,
      updatedAt: new Date("2026-10-01T00:00:01Z")
    });

    await expect(
      service.updateLdapAuth({
        ...baseActor,
        identityId: IDENTITY_ID,
        templateId: TEMPLATE_ID
      } as unknown as Parameters<typeof service.updateLdapAuth>[0])
    ).rejects.toBeInstanceOf(ConflictError);
    expect(identityLdapAuthDAL.updateById).not.toHaveBeenCalled();
  });

  it("takes no template lock on an update that names no template", async () => {
    const { service, identityAuthTemplateDAL } = createService({
      identityAuthMethods: [IdentityAuthMethod.LDAP_AUTH]
    });

    await service.updateLdapAuth({
      ...baseActor,
      identityId: IDENTITY_ID,
      accessTokenTTL: 3600
    } as unknown as Parameters<typeof service.updateLdapAuth>[0]);

    expect(identityAuthTemplateDAL.findByIdForShare).not.toHaveBeenCalled();
  });
});
