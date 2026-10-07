import { createMongoAbility } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { ForbiddenRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { InternalCaType } from "../certificate-authority-enums";
import { CaSigningConfigType } from "./ca-signing-config-enums";
import { caSigningConfigServiceFactory } from "./ca-signing-config-service";

const CA_PROJECT_ID = "ca-project";
const ACTOR_ORG_ID = "org-1";
const CONNECTION_ID = "conn-1";

const permissionActor = {
  type: ActorType.USER,
  id: "user-1",
  authMethod: AuthMethod.EMAIL,
  orgId: ACTOR_ORG_ID,
  rootOrgId: ACTOR_ORG_ID,
  parentOrgId: ACTOR_ORG_ID
};

const actorFields = {
  actor: ActorType.USER,
  actorId: "user-1",
  actorAuthMethod: AuthMethod.EMAIL,
  actorOrgId: ACTOR_ORG_ID,
  permissionActor
};

const DESTINATION: Record<string, Record<string, unknown>> = {
  [CaSigningConfigType.Venafi]: {
    applicationId: "6f1c7a52-6c55-4a9f-9a57-0d3c1a3f8f11",
    issuingTemplateId: "0b7e2c1d-9f3a-4c2e-8d1b-5a6f7e8d9c00"
  },
  [CaSigningConfigType.AzureAdCs]: { template: "SubCA" },
  [CaSigningConfigType.Adcs]: { template: "SubCA", caName: "corp-ca" }
};

const EXPECTED_APP: Record<string, AppConnection> = {
  [CaSigningConfigType.Venafi]: AppConnection.Venafi,
  [CaSigningConfigType.AzureAdCs]: AppConnection.AzureADCS,
  [CaSigningConfigType.Adcs]: AppConnection.ADCS
};

const EXTERNAL_TYPES = [CaSigningConfigType.Venafi, CaSigningConfigType.AzureAdCs, CaSigningConfigType.Adcs];

const buildService = ({
  existing = null as null | { id: string; type: string },
  validatorThrows = false,
  plan = { pkiEnterpriseCaIntegrations: true }
} = {}) => {
  const caSigningConfigDAL = {
    create: vi.fn(async (data: Record<string, unknown>) => ({ id: "cfg-new", ...data })),
    findByCaId: vi.fn(async () => existing),
    updateById: vi.fn(async (id: string, data: Record<string, unknown>) => ({ id, ...existing, ...data })),
    deleteById: vi.fn(async () => undefined),
    findOne: vi.fn(),
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({}))
  };

  const appConnectionService = {
    validateAppConnectionUsageById: vi.fn(async () => {
      if (validatorThrows) throw new ForbiddenRequestError({ message: "no connect" });
      return {};
    })
  };

  const licenseService = { getPlan: vi.fn(async () => plan) };

  const deps = {
    caSigningConfigDAL,
    certificateAuthorityDAL: {
      findById: vi.fn(),
      findByIdWithAssociatedCa: vi.fn(async () => ({
        id: "ca-1",
        name: "intermediate",
        projectId: CA_PROJECT_ID,
        internalCa: { id: "internal-ca-1", dn: "CN=intermediate" }
      }))
    },
    internalCertificateAuthorityDAL: {
      findOne: vi.fn(async () => ({ id: "internal-ca-1", type: InternalCaType.INTERMEDIATE })),
      updateById: vi.fn()
    },
    permissionService: {
      getProjectPermission: vi.fn(async () => ({
        permission: createMongoAbility([
          {
            action: ProjectPermissionCertificateAuthorityActions.Edit,
            subject: ProjectPermissionSub.CertificateAuthorities
          }
        ])
      }))
    },
    licenseService,
    appConnectionService,
    caAutoRenewalQueue: {
      queueVenafiInstall: vi.fn(),
      queueAdcsInstall: vi.fn(),
      queueNativeAdcsInstall: vi.fn()
    }
  };

  const service = caSigningConfigServiceFactory(deps as unknown as Parameters<typeof caSigningConfigServiceFactory>[0]);
  return { service, caSigningConfigDAL, appConnectionService, licenseService };
};

describe("createSigningConfig connection checks", () => {
  beforeEach(() => vi.clearAllMocks());

  test.each(EXTERNAL_TYPES)("%s checks the connection for the CA's project and the caller", async (type) => {
    const { service, appConnectionService, caSigningConfigDAL } = buildService();

    await service.createSigningConfig({
      caId: "ca-1",
      type,
      appConnectionId: CONNECTION_ID,
      destinationConfig: DESTINATION[type] as never,
      ...actorFields
    });

    expect(appConnectionService.validateAppConnectionUsageById).toHaveBeenCalledTimes(1);
    expect(appConnectionService.validateAppConnectionUsageById).toHaveBeenCalledWith(
      EXPECTED_APP[type],
      { connectionId: CONNECTION_ID, projectId: CA_PROJECT_ID },
      permissionActor
    );
    expect(caSigningConfigDAL.create).toHaveBeenCalledWith(
      expect.objectContaining({ type, appConnectionId: CONNECTION_ID, destinationConfig: DESTINATION[type] }),
      expect.anything()
    );
  });

  test.each(EXTERNAL_TYPES)("%s writes nothing when the connection check fails", async (type) => {
    const { service, caSigningConfigDAL } = buildService({ validatorThrows: true });

    await expect(
      service.createSigningConfig({
        caId: "ca-1",
        type,
        appConnectionId: CONNECTION_ID,
        destinationConfig: DESTINATION[type] as never,
        ...actorFields
      })
    ).rejects.toBeInstanceOf(ForbiddenRequestError);

    expect(caSigningConfigDAL.create).not.toHaveBeenCalled();
    expect(caSigningConfigDAL.deleteById).not.toHaveBeenCalled();
  });

  test.each(EXTERNAL_TYPES)("%s still requires the CA integrations licence", async (type) => {
    const { service, caSigningConfigDAL, licenseService } = buildService({
      plan: { pkiEnterpriseCaIntegrations: false }
    });

    await expect(
      service.createSigningConfig({
        caId: "ca-1",
        type,
        appConnectionId: CONNECTION_ID,
        destinationConfig: DESTINATION[type] as never,
        ...actorFields
      })
    ).rejects.toThrow(/plan restriction/);

    expect(licenseService.getPlan).toHaveBeenCalled();
    expect(caSigningConfigDAL.create).not.toHaveBeenCalled();
  });

  test("switching between external types skips the licence check", async () => {
    const { service, licenseService } = buildService({
      existing: { id: "cfg-old", type: CaSigningConfigType.Venafi },
      plan: { pkiEnterpriseCaIntegrations: false }
    });

    await service.createSigningConfig({
      caId: "ca-1",
      type: CaSigningConfigType.AzureAdCs,
      appConnectionId: CONNECTION_ID,
      destinationConfig: DESTINATION[CaSigningConfigType.AzureAdCs] as never,
      ...actorFields
    });

    expect(licenseService.getPlan).not.toHaveBeenCalled();
  });

  test.each([CaSigningConfigType.Internal, CaSigningConfigType.Manual])(
    "%s does not check a connection or the licence",
    async (type) => {
      const { service, appConnectionService, licenseService, caSigningConfigDAL } = buildService();

      await service.createSigningConfig({
        caId: "ca-1",
        type,
        parentCaId: type === CaSigningConfigType.Internal ? "parent-ca" : undefined,
        ...actorFields
      });

      expect(appConnectionService.validateAppConnectionUsageById).not.toHaveBeenCalled();
      expect(licenseService.getPlan).not.toHaveBeenCalled();
      expect(caSigningConfigDAL.create).toHaveBeenCalledWith(
        expect.objectContaining({ type, appConnectionId: undefined, destinationConfig: undefined }),
        expect.anything()
      );
    }
  );
});

describe("updateSigningConfig connection checks", () => {
  beforeEach(() => vi.clearAllMocks());

  test.each(EXTERNAL_TYPES)("%s checks a new connection for the CA's project and the caller", async (type) => {
    const { service, appConnectionService, caSigningConfigDAL } = buildService({
      existing: { id: "cfg-1", type }
    });

    await service.updateSigningConfig({ caId: "ca-1", appConnectionId: CONNECTION_ID, ...actorFields });

    expect(appConnectionService.validateAppConnectionUsageById).toHaveBeenCalledTimes(1);
    expect(appConnectionService.validateAppConnectionUsageById).toHaveBeenCalledWith(
      EXPECTED_APP[type],
      { connectionId: CONNECTION_ID, projectId: CA_PROJECT_ID },
      permissionActor
    );
    expect(caSigningConfigDAL.updateById).toHaveBeenCalledWith(
      "cfg-1",
      expect.objectContaining({ appConnectionId: CONNECTION_ID })
    );
  });

  test.each(EXTERNAL_TYPES)("%s writes nothing when the connection check fails", async (type) => {
    const { service, caSigningConfigDAL } = buildService({
      existing: { id: "cfg-1", type },
      validatorThrows: true
    });

    await expect(
      service.updateSigningConfig({ caId: "ca-1", appConnectionId: CONNECTION_ID, ...actorFields })
    ).rejects.toBeInstanceOf(ForbiddenRequestError);

    expect(caSigningConfigDAL.updateById).not.toHaveBeenCalled();
  });

  test.each(EXTERNAL_TYPES)("%s does not check the connection when none is sent", async (type) => {
    const { service, appConnectionService, caSigningConfigDAL } = buildService({
      existing: { id: "cfg-1", type }
    });

    await service.updateSigningConfig({
      caId: "ca-1",
      destinationConfig: DESTINATION[type] as never,
      ...actorFields
    });

    expect(appConnectionService.validateAppConnectionUsageById).not.toHaveBeenCalled();
    expect(caSigningConfigDAL.updateById).toHaveBeenCalledWith(
      "cfg-1",
      expect.objectContaining({ destinationConfig: DESTINATION[type] })
    );
  });
});
