import { createMongoAbility, ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  OrgPermissionIdentityActions,
  OrgPermissionMachineIdentityAuthTemplateActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { IdentityKubernetesAuthTokenReviewMode } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-types";

import { IdentityAuthTemplateMethod } from "./identity-auth-template-enums";
import { identityAuthTemplateServiceFactory } from "./identity-auth-template-service";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ isDevelopmentMode: false, ALLOW_INTERNAL_IP_CONNECTIONS: false })
}));

// every other host in the suite is a literal IP, which skips resolution entirely, so a
// blanket rejection only ever fires for the unresolvable case below
vi.mock("node:dns/promises", () => ({
  default: {
    lookup: vi.fn(() =>
      Promise.reject(Object.assign(new Error("getaddrinfo ENOTFOUND idp.invalid"), { code: "ENOTFOUND" }))
    )
  }
}));

const ORG_ID = "org-id";
const TEMPLATE_ID = "template-id";
const GATEWAY_V2_ID = "gateway-v2-id";
const PRIVATE_HOST = "https://10.0.0.1";
// a literal IP keeps the suite hermetic: blockLocalAndPrivateIpAddresses skips the DNS lookup
const PUBLIC_HOST = "https://8.8.8.8";

const baseBlobFields = {
  kubernetesHost: PUBLIC_HOST,
  tokenReviewMode: IdentityKubernetesAuthTokenReviewMode.Api,
  tokenReviewerJwt: "reviewer-jwt",
  allowedAudience: ""
};

const NO_GATEWAY = { gatewayV2Id: null, gatewayPoolId: null };

const ADMIN_RULES: RawRuleOf<MongoAbility>[] = [{ action: "manage", subject: "all" }];

const createService = ({
  authMethod = IdentityAuthTemplateMethod.KUBERNETES,
  blobFields = baseBlobFields,
  gatewayColumns = { gatewayV2Id: GATEWAY_V2_ID, gatewayPoolId: null },
  liveGatewayV2Ids = [GATEWAY_V2_ID],
  orgRules = ADMIN_RULES,
  projectRules = ADMIN_RULES,
  linkedIdentities = [{ identityId: "identity-id", identityName: "identity", identityProjectId: null }]
}: {
  authMethod?: IdentityAuthTemplateMethod;
  blobFields?: Record<string, unknown>;
  gatewayColumns?: { gatewayV2Id: string | null; gatewayPoolId: string | null };
  liveGatewayV2Ids?: string[];
  orgRules?: RawRuleOf<MongoAbility>[];
  projectRules?: RawRuleOf<MongoAbility>[];
  linkedIdentities?: { identityId: string; identityName: string; identityProjectId: string | null }[];
} = {}) => {
  const identityKubernetesAuthDAL = {
    updateByTemplateId: vi.fn().mockResolvedValue([{ identityId: "identity-id" }])
  };
  const identityOidcAuthDAL = {
    updateByTemplateId: vi.fn().mockResolvedValue([{ identityId: "identity-id" }])
  };

  const templateRow = {
    id: TEMPLATE_ID,
    orgId: ORG_ID,
    name: "auth-template",
    authMethod,
    // the fake cipher pair below round-trips plaintext, so the "encrypted" blob is the JSON
    templateFields: Buffer.from(JSON.stringify(blobFields)),
    ...gatewayColumns
  };

  const identityAuthTemplateDAL = {
    findByIdAndOrgId: vi.fn().mockResolvedValue(templateRow),
    findTemplateUsages: vi.fn().mockResolvedValue(linkedIdentities),
    updateById: vi.fn().mockImplementation((id: string, data: Record<string, unknown>) => ({
      ...templateRow,
      id,
      ...data
    })),
    delete: vi.fn().mockResolvedValue([templateRow]),
    create: vi.fn().mockImplementation((data: Record<string, unknown>) => ({ ...templateRow, ...data })),
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({}))
  };

  const gatewayV2DAL = {
    find: vi.fn().mockImplementation(({ id }: { id: string }) => (liveGatewayV2Ids.includes(id) ? [{ id }] : []))
  };
  const gatewayPoolDAL = { findById: vi.fn().mockResolvedValue(null) };
  const auditLogCreate = vi.fn();
  const identityLdapAuthDAL = { updateByTemplateId: vi.fn().mockResolvedValue([{ identityId: "identity-id" }]) };
  const getProjectPermission = vi.fn().mockResolvedValue({ permission: createMongoAbility(projectRules) });

  const service = identityAuthTemplateServiceFactory({
    identityAuthTemplateDAL,
    identityLdapAuthDAL,
    identityKubernetesAuthDAL,
    identityOidcAuthDAL,
    gatewayV2DAL,
    gatewayPoolDAL,
    orgDAL: { findById: vi.fn().mockResolvedValue({ requireGatewayPools: false, shouldUseNewPrivilegeSystem: true }) },
    permissionService: {
      getOrgPermission: vi.fn().mockResolvedValue({ permission: createMongoAbility(orgRules) }),
      getProjectPermission,
      getActorGrantAbilities: vi.fn().mockResolvedValue([])
    },
    kmsService: {
      createCipherPairWithDataKey: vi.fn().mockResolvedValue({
        encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText }),
        decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
      })
    },
    licenseService: {
      getPlan: vi.fn().mockResolvedValue({ machineIdentityAuthTemplates: true, gateway: true, gatewayPool: true })
    },
    auditLogService: { createAuditLog: auditLogCreate }
  } as unknown as Parameters<typeof identityAuthTemplateServiceFactory>[0]);

  return {
    service,
    identityKubernetesAuthDAL,
    identityOidcAuthDAL,
    identityLdapAuthDAL,
    identityAuthTemplateDAL,
    auditLogCreate,
    getProjectPermission
  };
};

const patchTemplate = (service: ReturnType<typeof createService>["service"], templateFields: Record<string, unknown>) =>
  service.updateTemplate({
    templateId: TEMPLATE_ID,
    templateFields,
    actorId: "actor-id",
    actor: "user",
    actorAuthMethod: undefined,
    actorOrgId: ORG_ID
  } as unknown as Parameters<typeof service.updateTemplate>[0]);

describe("identityAuthTemplateServiceFactory kubernetes host validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks a private host when the template has no gateway", async () => {
    // a deleted gateway leaves these columns NULL via ON DELETE SET NULL, so the reference
    // cannot outlive the gateway the way a stale id in the encrypted blob could
    const { service, identityKubernetesAuthDAL } = createService({ gatewayColumns: NO_GATEWAY });

    await expect(patchTemplate(service, { kubernetesHost: PRIVATE_HOST })).rejects.toThrow(
      "Local IPs not allowed as URL"
    );
    expect(identityKubernetesAuthDAL.updateByTemplateId).not.toHaveBeenCalled();
  });

  it("blocks a scheme-less private host (block sees the same URL the dial sites use)", async () => {
    // the stored host may legally omit a scheme; without normalization new URL() inside
    // the block throws a TypeError instead of validating the host
    const { service, identityKubernetesAuthDAL } = createService({ gatewayColumns: NO_GATEWAY });

    await expect(patchTemplate(service, { kubernetesHost: "10.0.0.1:6443" })).rejects.toThrow(
      "Local IPs not allowed as URL"
    );
    expect(identityKubernetesAuthDAL.updateByTemplateId).not.toHaveBeenCalled();
  });

  it("allows a private host while the template's gateway column is set", async () => {
    const { service, identityKubernetesAuthDAL } = createService();

    await patchTemplate(service, { kubernetesHost: PRIVATE_HOST });

    expect(identityKubernetesAuthDAL.updateByTemplateId).toHaveBeenCalledWith(
      { templateId: TEMPLATE_ID },
      expect.objectContaining({ kubernetesHost: PRIVATE_HOST }),
      expect.anything()
    );
  });

  it("blocks a private host when the patch clears the gateway", async () => {
    const { service } = createService();

    await expect(patchTemplate(service, { kubernetesHost: PRIVATE_HOST, gatewayId: null })).rejects.toThrow(
      "Local IPs not allowed as URL"
    );
  });

  it("rejects a gateway the org does not have", async () => {
    const { service } = createService();

    await expect(patchTemplate(service, { gatewayId: "11111111-1111-1111-1111-111111111111" })).rejects.toThrow(
      "11111111-1111-1111-1111-111111111111' was not found"
    );
  });

  it("blocks even an unrelated edit while a private host sits behind a deleted gateway", async () => {
    // ON DELETE SET NULL can strip the gateway out-of-band, leaving a direct-dial private host.
    // login dials that host with no address block of its own, so any patch that would propagate
    // it must re-vet the host, not just the ones that touch a dial field. the template is not
    // stranded: re-adding a gateway or repointing to a public host in the same patch clears it
    const { service, identityKubernetesAuthDAL } = createService({
      blobFields: { ...baseBlobFields, kubernetesHost: PRIVATE_HOST },
      gatewayColumns: NO_GATEWAY
    });

    await expect(patchTemplate(service, { tokenReviewerJwt: "rotated-jwt" })).rejects.toThrow(
      "Local IPs not allowed as URL"
    );
    expect(identityKubernetesAuthDAL.updateByTemplateId).not.toHaveBeenCalled();
  });
});

describe("identityAuthTemplateServiceFactory gateway column storage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores the gateway in columns and keeps it out of the encrypted blob", async () => {
    const { service, identityAuthTemplateDAL } = createService({ gatewayColumns: NO_GATEWAY });

    await patchTemplate(service, { gatewayId: GATEWAY_V2_ID });

    const [, update] = identityAuthTemplateDAL.updateById.mock.calls[0] as [string, Record<string, unknown>];
    // the gateway resolves onto its own column, mirroring identity_kubernetes_auths
    expect(update.gatewayV2Id).toBe(GATEWAY_V2_ID);
    expect(JSON.parse((update.templateFields as Buffer).toString())).not.toHaveProperty("gatewayId");
  });

  it("reports the gatewayV2Id column as the logical gatewayId", async () => {
    const { service } = createService({
      gatewayColumns: { gatewayV2Id: GATEWAY_V2_ID, gatewayPoolId: null }
    });

    const updated = await patchTemplate(service, { allowedAudience: "aud" });

    expect(updated.templateFields).toMatchObject({ gatewayId: GATEWAY_V2_ID, gatewayPoolId: null });
  });

  it("propagates the template's gateway columns onto linked identities", async () => {
    const { service, identityKubernetesAuthDAL } = createService({ gatewayColumns: NO_GATEWAY });

    await patchTemplate(service, { gatewayId: GATEWAY_V2_ID });

    expect(identityKubernetesAuthDAL.updateByTemplateId).toHaveBeenCalledWith(
      { templateId: TEMPLATE_ID },
      expect.objectContaining({ gatewayV2Id: GATEWAY_V2_ID, gatewayPoolId: null }),
      expect.anything()
    );
  });

  it("keeps gateway fields out of a method that does not declare them", async () => {
    // LDAP has no gateway concept, so its fields view must not sprout the columns and rely on
    // the route's response schema to strip them again
    const { service } = createService({
      authMethod: IdentityAuthTemplateMethod.LDAP,
      blobFields: { url: "ldap://example.com", bindDN: "cn=admin", bindPass: "pw", searchBase: "dc=example" },
      gatewayColumns: NO_GATEWAY
    });

    const updated = await patchTemplate(service, { searchBase: "dc=other" });

    expect(updated.templateFields).not.toHaveProperty("gatewayId");
    expect(updated.templateFields).not.toHaveProperty("gatewayPoolId");
  });

  it("leaves the gateway columns alone when the patch does not mention them", async () => {
    const { service, identityKubernetesAuthDAL, identityAuthTemplateDAL } = createService();

    await patchTemplate(service, { allowedAudience: "aud" });

    const [, update] = identityAuthTemplateDAL.updateById.mock.calls[0] as [string, Record<string, unknown>];
    expect(update).not.toHaveProperty("gatewayV2Id");
    // linked rows still get the row's existing gateway, so they cannot drift from the template
    expect(identityKubernetesAuthDAL.updateByTemplateId).toHaveBeenCalledWith(
      { templateId: TEMPLATE_ID },
      expect.objectContaining({ gatewayV2Id: GATEWAY_V2_ID }),
      expect.anything()
    );
  });
});

const baseOidcBlobFields = {
  oidcDiscoveryUrl: PUBLIC_HOST,
  boundIssuer: "https://issuer.example.com",
  boundAudiences: "https://github.com/acme",
  caCert: "stored-ca"
};

const createOidcService = (blobFields: Record<string, unknown> = baseOidcBlobFields) =>
  createService({ authMethod: IdentityAuthTemplateMethod.OIDC, blobFields, gatewayColumns: NO_GATEWAY });

describe("identityAuthTemplateServiceFactory oidc templates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("propagates the full merged connection to linked identities, not just the patched keys", async () => {
    const { service, identityOidcAuthDAL } = createOidcService();

    await patchTemplate(service, { boundIssuer: "https://other-issuer.example.com" });

    expect(identityOidcAuthDAL.updateByTemplateId).toHaveBeenCalledWith(
      { templateId: TEMPLATE_ID },
      {
        oidcDiscoveryUrl: PUBLIC_HOST,
        boundIssuer: "https://other-issuer.example.com",
        boundAudiences: "https://github.com/acme",
        encryptedCaCertificate: Buffer.from("stored-ca")
      },
      expect.anything()
    );
  });

  it("clears the propagated CA certificate when the patch empties it", async () => {
    const { service, identityOidcAuthDAL } = createOidcService();

    await patchTemplate(service, { caCert: "" });

    expect(identityOidcAuthDAL.updateByTemplateId).toHaveBeenCalledWith(
      { templateId: TEMPLATE_ID },
      expect.objectContaining({ encryptedCaCertificate: null }),
      expect.anything()
    );
  });

  it("blocks a private discovery URL before anything propagates", async () => {
    const { service, identityOidcAuthDAL } = createOidcService();

    await expect(patchTemplate(service, { oidcDiscoveryUrl: PRIVATE_HOST })).rejects.toThrow(
      "Local IPs not allowed as URL"
    );
    expect(identityOidcAuthDAL.updateByTemplateId).not.toHaveBeenCalled();
  });

  it("blocks even an unrelated edit while a private discovery URL is stored", async () => {
    // create/update both vet the URL, but an operator toggle (dev mode, allow-internal) can
    // let one through; any patch propagates the whole merged connection, so it must re-vet
    const { service, identityOidcAuthDAL } = createOidcService({
      ...baseOidcBlobFields,
      oidcDiscoveryUrl: PRIVATE_HOST
    });

    await expect(patchTemplate(service, { boundAudiences: "aud" })).rejects.toThrow("Local IPs not allowed as URL");
    expect(identityOidcAuthDAL.updateByTemplateId).not.toHaveBeenCalled();
  });

  it("reports an unresolvable discovery host as a client error rather than a 500", async () => {
    const { service, identityOidcAuthDAL } = createOidcService();

    const error = await patchTemplate(service, { oidcDiscoveryUrl: "https://idp.invalid" }).catch(
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as BadRequestError).message).toContain(
      "Could not resolve the host of the OIDC discovery URL 'https://idp.invalid/'"
    );
    expect(identityOidcAuthDAL.updateByTemplateId).not.toHaveBeenCalled();
  });

  it("audits the propagation as an OIDC auth update", async () => {
    const { service, auditLogCreate } = createOidcService();

    await patchTemplate(service, { boundIssuer: "https://other-issuer.example.com" });

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const [entry] = auditLogCreate.mock.calls[0] as [{ event: { type: string } }];
    expect(entry.event.type).toBe("update-identity-oidc-auth");
  });

  it("unlinks linked identities on delete while keeping their copied config", async () => {
    const { service, identityOidcAuthDAL } = createOidcService();

    await service.deleteTemplate({
      templateId: TEMPLATE_ID,
      actorId: "actor-id",
      actor: "user",
      actorAuthMethod: undefined,
      actorOrgId: ORG_ID
    } as unknown as Parameters<typeof service.deleteTemplate>[0]);

    expect(identityOidcAuthDAL.updateByTemplateId).toHaveBeenCalledWith(
      { templateId: TEMPLATE_ID },
      { templateId: null },
      expect.anything()
    );
  });
});

// the route accepts any method's fields, so this guard is the only method-membership check
describe("identityAuthTemplateServiceFactory field patch method guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a field from another auth method before anything is written", async () => {
    const { service, identityOidcAuthDAL, identityAuthTemplateDAL, auditLogCreate } = createOidcService();

    const error = await patchTemplate(service, { bindDN: "cn=admin,dc=example,dc=com" }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as BadRequestError).message).toBe(
      "Template fields [bindDN] are not valid for a 'oidc' auth template"
    );
    expect(identityAuthTemplateDAL.updateById).not.toHaveBeenCalled();
    expect(identityOidcAuthDAL.updateByTemplateId).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("rejects the whole patch when a valid field rides along with a foreign one", async () => {
    const { service, identityOidcAuthDAL, identityAuthTemplateDAL } = createOidcService();

    const error = await patchTemplate(service, {
      boundIssuer: "https://other-issuer.example.com",
      bindDN: "cn=admin,dc=example,dc=com"
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as BadRequestError).message).toBe(
      "Template fields [bindDN] are not valid for a 'oidc' auth template"
    );
    expect(identityAuthTemplateDAL.updateById).not.toHaveBeenCalled();
    expect(identityOidcAuthDAL.updateByTemplateId).not.toHaveBeenCalled();
  });

  it("names every foreign field and the template's own method", async () => {
    const { service, identityAuthTemplateDAL } = createService({
      authMethod: IdentityAuthTemplateMethod.LDAP,
      blobFields: { url: "ldap://example.com", bindDN: "cn=admin", bindPass: "pw", searchBase: "dc=example" },
      gatewayColumns: NO_GATEWAY
    });

    const error = await patchTemplate(service, {
      oidcDiscoveryUrl: "https://idp.example.com",
      tokenReviewMode: IdentityKubernetesAuthTokenReviewMode.Api
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as BadRequestError).message).toBe(
      "Template fields [oidcDiscoveryUrl, tokenReviewMode] are not valid for a 'ldap' auth template"
    );
    expect(identityAuthTemplateDAL.updateById).not.toHaveBeenCalled();
  });
});

const LDAP_BLOB_FIELDS = { url: "ldap://8.8.8.8", bindDN: "cn=admin", bindPass: "pw", searchBase: "dc=example" };

const TEMPLATE_EDITOR_RULES: RawRuleOf<MongoAbility>[] = [
  {
    action: OrgPermissionMachineIdentityAuthTemplateActions.EditTemplates,
    subject: OrgPermissionSubjects.MachineIdentityAuthTemplate
  },
  {
    action: OrgPermissionMachineIdentityAuthTemplateActions.CreateTemplates,
    subject: OrgPermissionSubjects.MachineIdentityAuthTemplate
  }
];

const ORG_IDENTITY_EDIT_AUTH_RULE: RawRuleOf<MongoAbility> = {
  action: OrgPermissionIdentityActions.EditAuth,
  subject: OrgPermissionSubjects.Identity
};

const PROJECT_ID = "project-id";
const PROJECT_IDENTITY = {
  identityId: "project-identity-id",
  identityName: "deploy-bot",
  identityProjectId: PROJECT_ID
};

const createLdapService = (overrides: Parameters<typeof createService>[0] = {}) =>
  createService({
    authMethod: IdentityAuthTemplateMethod.LDAP,
    blobFields: LDAP_BLOB_FIELDS,
    gatewayColumns: NO_GATEWAY,
    ...overrides
  });

describe("identityAuthTemplateServiceFactory linked identity authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses a field patch when the editor cannot edit auth on a linked org identity", async () => {
    const { service, identityAuthTemplateDAL, identityLdapAuthDAL, auditLogCreate } = createLdapService({
      orgRules: TEMPLATE_EDITOR_RULES
    });

    await expect(patchTemplate(service, { url: "ldap://8.8.4.4", bindPass: "attacker" })).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(identityAuthTemplateDAL.updateById).not.toHaveBeenCalled();
    expect(identityLdapAuthDAL.updateByTemplateId).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("propagates when the editor also holds edit-auth on linked org identities", async () => {
    const { service, identityLdapAuthDAL } = createLdapService({
      orgRules: [...TEMPLATE_EDITOR_RULES, ORG_IDENTITY_EDIT_AUTH_RULE]
    });

    await patchTemplate(service, { searchBase: "dc=other" });

    expect(identityLdapAuthDAL.updateByTemplateId).toHaveBeenCalledTimes(1);
  });

  it("checks a project identity against the project's edit-auth, not the org's", async () => {
    const { service, identityLdapAuthDAL, getProjectPermission } = createLdapService({
      orgRules: [...TEMPLATE_EDITOR_RULES, ORG_IDENTITY_EDIT_AUTH_RULE],
      projectRules: [],
      linkedIdentities: [PROJECT_IDENTITY]
    });

    await expect(patchTemplate(service, { searchBase: "dc=other" })).rejects.toBeInstanceOf(ForbiddenError);
    expect(getProjectPermission).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROJECT_ID }));
    expect(identityLdapAuthDAL.updateByTemplateId).not.toHaveBeenCalled();
  });

  it("honors a project edit-auth grant scoped to the linked identity", async () => {
    const { service, identityLdapAuthDAL } = createLdapService({
      orgRules: TEMPLATE_EDITOR_RULES,
      projectRules: [
        {
          action: ProjectPermissionIdentityActions.EditAuth,
          subject: ProjectPermissionSub.Identity,
          conditions: { identityId: PROJECT_IDENTITY.identityId }
        }
      ],
      linkedIdentities: [PROJECT_IDENTITY]
    });

    await patchTemplate(service, { searchBase: "dc=other" });

    expect(identityLdapAuthDAL.updateByTemplateId).toHaveBeenCalledTimes(1);
  });

  it("lets a rename through without edit-auth, since nothing propagates", async () => {
    const { service, identityAuthTemplateDAL, identityLdapAuthDAL } = createLdapService({
      orgRules: TEMPLATE_EDITOR_RULES
    });

    await service.updateTemplate({
      templateId: TEMPLATE_ID,
      name: "renamed",
      actorId: "actor-id",
      actor: "user",
      actorAuthMethod: undefined,
      actorOrgId: ORG_ID
    } as unknown as Parameters<typeof service.updateTemplate>[0]);

    expect(identityAuthTemplateDAL.updateById).toHaveBeenCalledTimes(1);
    expect(identityLdapAuthDAL.updateByTemplateId).not.toHaveBeenCalled();
  });

  it("records the editor, not the platform, on the per-identity audit entries", async () => {
    const { service, auditLogCreate } = createLdapService();
    const auditLogInfo = {
      ipAddress: "203.0.113.7",
      userAgent: "test-agent",
      actor: { type: "user", metadata: { userId: "actor-id", email: "editor@example.com" } }
    };

    await service.updateTemplate({
      templateId: TEMPLATE_ID,
      templateFields: { searchBase: "dc=other" },
      actorId: "actor-id",
      actor: "user",
      actorAuthMethod: undefined,
      actorOrgId: ORG_ID,
      auditLogInfo
    } as unknown as Parameters<typeof service.updateTemplate>[0]);

    expect(auditLogCreate).toHaveBeenCalledWith(expect.objectContaining({ actor: auditLogInfo.actor }));
  });
});

describe("identityAuthTemplateServiceFactory ldap url validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks a private LDAP URL on update before anything propagates", async () => {
    const { service, identityLdapAuthDAL } = createLdapService();

    await expect(patchTemplate(service, { url: "ldap://10.0.0.1", bindPass: "pw" })).rejects.toThrow(
      "Local IPs not allowed as URL"
    );
    expect(identityLdapAuthDAL.updateByTemplateId).not.toHaveBeenCalled();
  });

  it("does not re-vet a stored URL the patch leaves alone, since LDAP propagates only patched keys", async () => {
    const { service, identityLdapAuthDAL } = createLdapService({
      blobFields: { ...LDAP_BLOB_FIELDS, url: "ldap://10.0.0.1" }
    });

    await patchTemplate(service, { searchBase: "dc=other" });

    expect(identityLdapAuthDAL.updateByTemplateId).toHaveBeenCalledWith(
      { templateId: TEMPLATE_ID },
      { searchBase: "dc=other" },
      expect.anything()
    );
  });

  it("reports an unparseable LDAP URL as a client error rather than a 500", async () => {
    const { service } = createLdapService();

    await expect(patchTemplate(service, { url: "not a url", bindPass: "pw" })).rejects.toBeInstanceOf(BadRequestError);
  });

  it("keeps credentials in an unresolvable LDAP URL out of the error message", async () => {
    const { service } = createLdapService();

    const error = await patchTemplate(service, {
      url: "ldap://missing.invalid/?token=secret",
      bindPass: "pw"
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as BadRequestError).message).toContain("ldap://missing.invalid/?token=[REDACTED]");
    expect((error as BadRequestError).message).not.toContain("secret");
  });

  it("blocks a private LDAP URL on create", async () => {
    const { service, identityAuthTemplateDAL } = createLdapService();

    await expect(
      service.createTemplate({
        name: "ldap-template",
        authMethod: IdentityAuthTemplateMethod.LDAP,
        templateFields: { ...LDAP_BLOB_FIELDS, url: "ldap://10.0.0.1" },
        actorId: "actor-id",
        actor: "user",
        actorAuthMethod: undefined,
        actorOrgId: ORG_ID
      } as unknown as Parameters<typeof service.createTemplate>[0])
    ).rejects.toThrow("Local IPs not allowed as URL");
    expect(identityAuthTemplateDAL.create).not.toHaveBeenCalled();
  });
});
