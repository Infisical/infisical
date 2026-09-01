import { createMongoAbility } from "@casl/ability";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IdentityKubernetesAuthTokenReviewMode } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-types";

import { IdentityAuthTemplateMethod } from "./identity-auth-template-enums";
import { identityAuthTemplateServiceFactory } from "./identity-auth-template-service";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ isDevelopmentMode: false, ALLOW_INTERNAL_IP_CONNECTIONS: false })
}));

const ORG_ID = "org-id";
const TEMPLATE_ID = "template-id";
const GATEWAY_ID = "gateway-id";
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

const NO_GATEWAY = { gatewayId: null, gatewayV2Id: null, gatewayPoolId: null };

const createService = ({
  authMethod = IdentityAuthTemplateMethod.KUBERNETES,
  blobFields = baseBlobFields,
  gatewayColumns = { gatewayId: GATEWAY_ID, gatewayV2Id: null, gatewayPoolId: null },
  liveGatewayIds = [GATEWAY_ID],
  liveGatewayV2Ids = [GATEWAY_V2_ID]
}: {
  authMethod?: IdentityAuthTemplateMethod;
  blobFields?: Record<string, unknown>;
  gatewayColumns?: { gatewayId: string | null; gatewayV2Id: string | null; gatewayPoolId: string | null };
  liveGatewayIds?: string[];
  liveGatewayV2Ids?: string[];
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
    findTemplateUsages: vi.fn().mockResolvedValue([{ identityId: "identity-id", identityName: "identity" }]),
    updateById: vi.fn().mockImplementation((id: string, data: Record<string, unknown>) => ({
      ...templateRow,
      id,
      ...data
    })),
    delete: vi.fn().mockResolvedValue([templateRow]),
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({}))
  };

  const gatewayDAL = {
    find: vi.fn().mockImplementation(({ id }: { id: string }) => (liveGatewayIds.includes(id) ? [{ id }] : []))
  };
  const gatewayV2DAL = {
    find: vi.fn().mockImplementation(({ id }: { id: string }) => (liveGatewayV2Ids.includes(id) ? [{ id }] : []))
  };
  const gatewayPoolDAL = { findById: vi.fn().mockResolvedValue(null) };
  const auditLogCreate = vi.fn();

  const service = identityAuthTemplateServiceFactory({
    identityAuthTemplateDAL,
    identityLdapAuthDAL: { updateByTemplateId: vi.fn().mockResolvedValue([]) },
    identityKubernetesAuthDAL,
    identityOidcAuthDAL,
    gatewayDAL,
    gatewayV2DAL,
    gatewayPoolDAL,
    permissionService: {
      getOrgPermission: vi
        .fn()
        .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) })
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

  return { service, identityKubernetesAuthDAL, identityOidcAuthDAL, identityAuthTemplateDAL, auditLogCreate };
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
      "was not found in this organization"
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
    // a v2 gateway resolves onto its own column, mirroring identity_kubernetes_auths
    expect(update.gatewayV2Id).toBe(GATEWAY_V2_ID);
    expect(update.gatewayId).toBeNull();
    expect(JSON.parse((update.templateFields as Buffer).toString())).not.toHaveProperty("gatewayId");
  });

  it("reports the logical gatewayId from whichever column holds it", async () => {
    const { service } = createService({
      gatewayColumns: { gatewayId: null, gatewayV2Id: GATEWAY_V2_ID, gatewayPoolId: null }
    });

    const updated = await patchTemplate(service, { allowedAudience: "aud" });

    expect(updated.templateFields).toMatchObject({ gatewayId: GATEWAY_V2_ID, gatewayPoolId: null });
  });

  it("propagates the template's gateway columns onto linked identities", async () => {
    const { service, identityKubernetesAuthDAL } = createService({ gatewayColumns: NO_GATEWAY });

    await patchTemplate(service, { gatewayId: GATEWAY_ID });

    expect(identityKubernetesAuthDAL.updateByTemplateId).toHaveBeenCalledWith(
      { templateId: TEMPLATE_ID },
      expect.objectContaining({ gatewayId: GATEWAY_ID, gatewayV2Id: null, gatewayPoolId: null }),
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
      expect.objectContaining({ gatewayId: GATEWAY_ID }),
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
