import { createMongoAbility } from "@casl/ability";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IdentityAuthMethod } from "@app/db/schemas";
import { TKubernetesTemplateFields } from "@app/ee/services/identity-auth-template/identity-auth-template-types";

import { identityKubernetesAuthServiceFactory } from "./identity-kubernetes-auth-service";
import { IdentityKubernetesAuthTokenReviewMode } from "./identity-kubernetes-auth-types";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ isDevelopmentMode: false, ALLOW_INTERNAL_IP_CONNECTIONS: false })
}));

// the real logger is initialized at server boot; the connectivity log lines on the
// happy path would otherwise dereference undefined
vi.mock("@app/lib/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/logger")>();
  return { ...actual, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
});

vi.mock("../super-admin/super-admin-fns", () => ({
  validateIdentityUpdateForSuperAdminPrivileges: vi.fn()
}));

// keep the pure cross-field checks real and stub only the outbound connectivity probes,
// so the suite exercises the actual validation without touching the network
vi.mock("./identity-kubernetes-auth-validators", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./identity-kubernetes-auth-validators")>();
  return {
    ...actual,
    validateKubernetesHostConnectivity: vi.fn().mockResolvedValue(undefined),
    validateTokenReviewerPermissions: vi.fn().mockResolvedValue(undefined)
  };
});

const ORG_ID = "org-id";
const IDENTITY_ID = "identity-id";
const TEMPLATE_ID = "template-id";
const PRIVATE_HOST = "https://10.0.0.1";
// a literal IP keeps the suite hermetic: blockLocalAndPrivateIpAddresses skips the DNS lookup
const PUBLIC_HOST = "https://8.8.8.8";

const NO_GATEWAY = { gatewayId: null, gatewayV2Id: null, gatewayPoolId: null };

const createService = ({
  templateBlobFields = {
    kubernetesHost: PUBLIC_HOST,
    tokenReviewMode: IdentityKubernetesAuthTokenReviewMode.Api,
    tokenReviewerJwt: "reviewer-jwt",
    allowedAudience: ""
  },
  templateGatewayColumns = NO_GATEWAY,
  identityAuthMethods = [] as string[]
}: {
  templateBlobFields?: TKubernetesTemplateFields;
  templateGatewayColumns?: typeof NO_GATEWAY;
  identityAuthMethods?: string[];
} = {}) => {
  const templateRow = {
    id: TEMPLATE_ID,
    orgId: ORG_ID,
    name: "auth-template",
    authMethod: "kubernetes",
    // the fake cipher pair below round-trips plaintext, so the "encrypted" blob is the JSON
    templateFields: Buffer.from(JSON.stringify(templateBlobFields)),
    ...templateGatewayColumns
  };

  const storedAuthRow = {
    id: "k8s-auth-id",
    identityId: IDENTITY_ID,
    templateId: null,
    accessTokenTTL: 0,
    accessTokenMaxTTL: 0,
    accessTokenNumUsesLimit: 0,
    accessTokenTrustedIps: [],
    kubernetesHost: PUBLIC_HOST,
    tokenReviewMode: IdentityKubernetesAuthTokenReviewMode.Api,
    allowedAudience: "",
    isTokenReviewerJwtTemplateSourced: false,
    verifyTlsCertificate: false,
    encryptedKubernetesCaCertificate: null,
    encryptedKubernetesTokenReviewerJwt: null,
    ...NO_GATEWAY
  };

  const identityKubernetesAuthDAL = {
    create: vi.fn().mockImplementation((data: Record<string, unknown>) => ({ id: "k8s-auth-id", ...data })),
    findOne: vi.fn().mockResolvedValue(storedAuthRow),
    updateById: vi.fn().mockImplementation((id: string, data: Record<string, unknown>) => ({
      ...storedAuthRow,
      ...data
    })),
    delete: vi.fn(),
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({}))
  };

  const service = identityKubernetesAuthServiceFactory({
    identityDAL: { findById: vi.fn() },
    identityKubernetesAuthDAL,
    identityAccessTokenDAL: { delete: vi.fn() },
    identityAuthTemplateDAL: { findByIdAndOrgId: vi.fn().mockResolvedValue(templateRow) },
    membershipIdentityDAL: {
      findOne: vi.fn(),
      update: vi.fn(),
      getIdentityById: vi.fn().mockResolvedValue({
        scopeOrgId: ORG_ID,
        identity: { id: IDENTITY_ID, orgId: ORG_ID, projectId: null, authMethods: identityAuthMethods }
      })
    },
    keyStore: { setItemWithExpiryNX: vi.fn() },
    permissionService: {
      getOrgPermission: vi
        .fn()
        .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) }),
      getProjectPermission: vi.fn()
    },
    licenseService: {
      getPlan: vi.fn().mockResolvedValue({
        machineIdentityAuthTemplates: true,
        gateway: true,
        gatewayPool: true,
        ipAllowlisting: true
      })
    },
    kmsService: {
      createCipherPairWithDataKey: vi.fn().mockResolvedValue({
        encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText }),
        decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
      })
    },
    gatewayService: {},
    gatewayV2Service: {},
    gatewayDAL: { find: vi.fn().mockResolvedValue([]) },
    gatewayV2DAL: { find: vi.fn().mockResolvedValue([]) },
    gatewayPoolService: { pickHealthyGateway: vi.fn(), runWithPoolFailover: vi.fn() },
    gatewayPoolDAL: { findById: vi.fn().mockResolvedValue(null) },
    orgDAL: { findById: vi.fn(), findOne: vi.fn(), findEffectiveOrgMembership: vi.fn() },
    identityAccessTokenService: {
      issueIdentityAccessToken: vi.fn(),
      revokeTokensForIdentityAuthMethod: vi.fn(),
      invalidateTrustedIpsCache: vi.fn()
    }
  } as unknown as Parameters<typeof identityKubernetesAuthServiceFactory>[0]);

  return { service, identityKubernetesAuthDAL };
};

const baseActor = {
  actor: "user",
  actorId: "actor-id",
  actorAuthMethod: undefined,
  actorOrgId: ORG_ID
};

const attachWithTemplate = (service: ReturnType<typeof createService>["service"]) =>
  service.attachKubernetesAuth({
    ...baseActor,
    identityId: IDENTITY_ID,
    templateId: TEMPLATE_ID,
    allowedNames: "",
    allowedNamespaces: "",
    accessTokenTTL: 7200,
    accessTokenMaxTTL: 7200,
    accessTokenNumUsesLimit: 0,
    accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }]
  } as unknown as Parameters<typeof service.attachKubernetesAuth>[0]);

const updateWithTemplate = (service: ReturnType<typeof createService>["service"]) =>
  service.updateKubernetesAuth({
    ...baseActor,
    identityId: IDENTITY_ID,
    templateId: TEMPLATE_ID
  } as unknown as Parameters<typeof service.updateKubernetesAuth>[0]);

describe("identityKubernetesAuthServiceFactory template attach validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects attaching a gateway-mode template whose gateway was deleted", async () => {
    // ON DELETE SET NULL clears the template's gateway columns out-of-band, leaving a config
    // that would attach cleanly and then fail every login
    const { service, identityKubernetesAuthDAL } = createService({
      templateBlobFields: { tokenReviewMode: IdentityKubernetesAuthTokenReviewMode.Gateway, allowedAudience: "" },
      templateGatewayColumns: NO_GATEWAY
    });

    await expect(attachWithTemplate(service)).rejects.toThrow("Cannot use auth template 'auth-template'");
    expect(identityKubernetesAuthDAL.create).not.toHaveBeenCalled();
  });

  it("rejects attaching a template whose private host lost its gateway", async () => {
    const { service, identityKubernetesAuthDAL } = createService({
      templateBlobFields: {
        kubernetesHost: PRIVATE_HOST,
        tokenReviewMode: IdentityKubernetesAuthTokenReviewMode.Api,
        tokenReviewerJwt: "reviewer-jwt",
        allowedAudience: ""
      },
      templateGatewayColumns: NO_GATEWAY
    });

    await expect(attachWithTemplate(service)).rejects.toThrow("Local IPs not allowed as URL");
    expect(identityKubernetesAuthDAL.create).not.toHaveBeenCalled();
  });

  it("attaches a healthy direct-dial template", async () => {
    const { service, identityKubernetesAuthDAL } = createService();

    await attachWithTemplate(service);

    expect(identityKubernetesAuthDAL.create).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: TEMPLATE_ID, kubernetesHost: PUBLIC_HOST }),
      expect.anything()
    );
  });

  it("rejects linking a degraded gateway-mode template on update", async () => {
    const { service, identityKubernetesAuthDAL } = createService({
      templateBlobFields: { tokenReviewMode: IdentityKubernetesAuthTokenReviewMode.Gateway, allowedAudience: "" },
      templateGatewayColumns: NO_GATEWAY,
      identityAuthMethods: [IdentityAuthMethod.KUBERNETES_AUTH]
    });

    await expect(updateWithTemplate(service)).rejects.toThrow("Cannot use auth template 'auth-template'");
    expect(identityKubernetesAuthDAL.updateById).not.toHaveBeenCalled();
  });
});
