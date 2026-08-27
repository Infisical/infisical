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
const PRIVATE_HOST = "https://10.0.0.1";
const PUBLIC_HOST = "https://8.8.8.8";

const baseTemplateFields = {
  kubernetesHost: PUBLIC_HOST,
  tokenReviewMode: IdentityKubernetesAuthTokenReviewMode.Api,
  tokenReviewerJwt: "reviewer-jwt",
  allowedAudience: "",
  gatewayId: GATEWAY_ID
};

const createService = ({
  templateFields = baseTemplateFields,
  liveGatewayIds = [GATEWAY_ID]
}: {
  templateFields?: Record<string, unknown>;
  liveGatewayIds?: string[];
} = {}) => {
  const identityKubernetesAuthDAL = {
    updateByTemplateId: vi.fn().mockResolvedValue([{ identityId: "identity-id" }])
  };

  const identityAuthTemplateDAL = {
    findByIdAndOrgId: vi.fn().mockResolvedValue({
      id: TEMPLATE_ID,
      orgId: ORG_ID,
      name: "k8s-template",
      authMethod: IdentityAuthTemplateMethod.KUBERNETES,
      // the fake cipher pair below round-trips plaintext, so the "encrypted" blob is the JSON
      templateFields: Buffer.from(JSON.stringify(templateFields))
    }),
    findTemplateUsages: vi.fn().mockResolvedValue([{ identityId: "identity-id", identityName: "identity" }]),
    updateById: vi.fn().mockImplementation((id: string, data: Record<string, unknown>) => ({
      id,
      orgId: ORG_ID,
      name: "k8s-template",
      authMethod: IdentityAuthTemplateMethod.KUBERNETES,
      ...data
    })),
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({}))
  };

  // a live gateway resolves as v1; anything else is treated as deleted by both DALs
  const gatewayDAL = {
    find: vi.fn().mockImplementation(({ id }: { id: string }) => (liveGatewayIds.includes(id) ? [{ id }] : []))
  };
  const gatewayV2DAL = { find: vi.fn().mockResolvedValue([]) };
  const gatewayPoolDAL = { findById: vi.fn().mockResolvedValue(null) };

  const service = identityAuthTemplateServiceFactory({
    identityAuthTemplateDAL,
    identityLdapAuthDAL: { updateByTemplateId: vi.fn() },
    identityKubernetesAuthDAL,
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
    auditLogService: { createAuditLog: vi.fn() }
  } as unknown as Parameters<typeof identityAuthTemplateServiceFactory>[0]);

  return { service, identityKubernetesAuthDAL, identityAuthTemplateDAL };
};

const updateHost = (service: ReturnType<typeof createService>["service"], kubernetesHost: string) =>
  service.updateTemplate({
    templateId: TEMPLATE_ID,
    templateFields: { kubernetesHost },
    actorId: "actor-id",
    actor: "user",
    actorAuthMethod: undefined,
    actorOrgId: ORG_ID
  } as unknown as Parameters<typeof service.updateTemplate>[0]);

describe("identityAuthTemplateServiceFactory kubernetes host validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks a private host when the template's gateway no longer exists", async () => {
    // the linked identities lost their gateway columns to ON DELETE SET NULL when the gateway
    // was deleted, so the stale id in the encrypted blob must not exempt the host check
    const { service, identityKubernetesAuthDAL } = createService({ liveGatewayIds: [] });

    await expect(updateHost(service, PRIVATE_HOST)).rejects.toThrow("Local IPs not allowed as URL");
    expect(identityKubernetesAuthDAL.updateByTemplateId).not.toHaveBeenCalled();
  });

  it("allows a private host while the template's gateway is still live", async () => {
    const { service, identityKubernetesAuthDAL } = createService();

    await updateHost(service, PRIVATE_HOST);

    expect(identityKubernetesAuthDAL.updateByTemplateId).toHaveBeenCalledWith(
      { templateId: TEMPLATE_ID },
      expect.objectContaining({ kubernetesHost: PRIVATE_HOST }),
      expect.anything()
    );
  });

  it("blocks a private host when the template has no gateway at all", async () => {
    const { service } = createService({
      templateFields: { ...baseTemplateFields, gatewayId: undefined }
    });

    await expect(updateHost(service, PRIVATE_HOST)).rejects.toThrow("Local IPs not allowed as URL");
  });

  it("still permits unrelated edits when the gateway was deleted after authoring", async () => {
    // rotating the reviewer JWT carries no host, so a dangling gateway must not block it
    const { service, identityKubernetesAuthDAL } = createService({ liveGatewayIds: [] });

    await service.updateTemplate({
      templateId: TEMPLATE_ID,
      templateFields: { tokenReviewerJwt: "rotated-jwt" },
      actorId: "actor-id",
      actor: "user",
      actorAuthMethod: undefined,
      actorOrgId: ORG_ID
    } as unknown as Parameters<typeof service.updateTemplate>[0]);

    expect(identityKubernetesAuthDAL.updateByTemplateId).toHaveBeenCalled();
  });

  it("still permits unrelated edits when a private host sits behind a deleted gateway", async () => {
    // the host is legitimately private because it was only ever reached through the gateway;
    // re-checking it on an edit that cannot change where we dial would strand the template
    const { service, identityKubernetesAuthDAL } = createService({
      templateFields: { ...baseTemplateFields, kubernetesHost: PRIVATE_HOST },
      liveGatewayIds: []
    });

    await service.updateTemplate({
      templateId: TEMPLATE_ID,
      templateFields: { tokenReviewerJwt: "rotated-jwt" },
      actorId: "actor-id",
      actor: "user",
      actorAuthMethod: undefined,
      actorOrgId: ORG_ID
    } as unknown as Parameters<typeof service.updateTemplate>[0]);

    expect(identityKubernetesAuthDAL.updateByTemplateId).toHaveBeenCalled();
  });

  it("propagates a public host regardless of gateway state", async () => {
    const { service, identityKubernetesAuthDAL } = createService({ liveGatewayIds: [] });

    await updateHost(service, PUBLIC_HOST);

    expect(identityKubernetesAuthDAL.updateByTemplateId).toHaveBeenCalledWith(
      { templateId: TEMPLATE_ID },
      expect.objectContaining({ kubernetesHost: PUBLIC_HOST }),
      expect.anything()
    );
  });
});
