import { createMongoAbility, MongoAbility } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

const { ibmProviderFns, entraProviderFns } = vi.hoisted(() => ({
  ibmProviderFns: {
    fetchOrganizations: vi.fn().mockResolvedValue([]),
    fetchOrganizationCatalogs: vi.fn().mockResolvedValue([]),
    fetchOrganizationApps: vi.fn().mockResolvedValue([])
  },
  entraProviderFns: {
    fetchAzureEntraIdUsers: vi.fn().mockResolvedValue([])
  }
}));

// the provider barrel reaches @app/lib/gateway, whose QUIC native binding is not loadable in unit tests
vi.mock("@app/lib/gateway", async () => {
  const gatewayTypes = await import("@app/lib/gateway/types");
  return {
    ...gatewayTypes,
    pingGatewayAndVerify: vi.fn(),
    withGatewayProxy: vi.fn()
  };
});

vi.mock("./providers/ibm-api-connect", () => ({
  IbmApiConnectProvider: () => ibmProviderFns
}));

vi.mock("./providers/azure-entra-id", () => ({
  AzureEntraIDProvider: () => entraProviderFns
}));

// eslint-disable-next-line import/first
import { dynamicSecretServiceFactory } from "./dynamic-secret-service";

const PROJECT_SLUG = "my-project";
const PROJECT_ID = "3d1b1b0a-0000-4000-8000-000000000001";

const actorArgs = {
  actor: ActorType.USER,
  actorId: "user-1",
  actorAuthMethod: AuthMethod.EMAIL,
  actorOrgId: "org-1"
};

const ibmCredentials = {
  instanceUrl: "https://api-connect.example.com",
  apiKey: "api-key",
  clientId: "client-id",
  clientSecret: "client-secret"
};

const makeService = (permission: MongoAbility, project: { id: string } | null = { id: PROJECT_ID }) => {
  const findProjectBySlug = vi.fn().mockResolvedValue(project);
  const getProjectPermission = vi.fn().mockResolvedValue({ permission });

  const service = dynamicSecretServiceFactory({
    projectDAL: { findProjectBySlug } as never,
    permissionService: { getProjectPermission } as never,
    dynamicSecretDAL: {} as never,
    dynamicSecretLeaseDAL: {} as never,
    dynamicSecretProviders: {} as never,
    dynamicSecretQueueService: {} as never,
    licenseService: {} as never,
    folderDAL: {} as never,
    kmsService: {} as never,
    gatewayDAL: {} as never,
    gatewayV2DAL: {} as never,
    gatewayPoolService: {} as never,
    resourceMetadataDAL: {} as never
  });

  return { service, findProjectBySlug, getProjectPermission };
};

const discoveryCalls = (service: ReturnType<typeof makeService>["service"]) => [
  {
    name: "fetchIbmApiConnectOrgs",
    call: () => service.fetchIbmApiConnectOrgs({ ...ibmCredentials, projectSlug: PROJECT_SLUG, ...actorArgs })
  },
  {
    name: "fetchIbmApiConnectOrgCatalogs",
    call: () =>
      service.fetchIbmApiConnectOrgCatalogs({
        ...ibmCredentials,
        orgId: "org-id",
        projectSlug: PROJECT_SLUG,
        ...actorArgs
      })
  },
  {
    name: "fetchIbmApiConnectOrgApps",
    call: () =>
      service.fetchIbmApiConnectOrgApps({
        ...ibmCredentials,
        orgId: "org-id",
        catalogId: "catalog-id",
        projectSlug: PROJECT_SLUG,
        ...actorArgs
      })
  },
  {
    name: "fetchAzureEntraIdUsers",
    call: () =>
      service.fetchAzureEntraIdUsers({
        tenantId: "tenant-id",
        applicationId: "application-id",
        clientSecret: "client-secret",
        projectSlug: PROJECT_SLUG,
        ...actorArgs
      })
  }
];

describe("dynamic secret provider discovery authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each(discoveryCalls(makeService(createMongoAbility([])).service).map((c) => c.name))(
    "%s rejects an actor with no dynamic secret permission",
    async (name) => {
      const { service } = makeService(createMongoAbility([{ action: "read", subject: ProjectPermissionSub.Secrets }]));
      const { call } = discoveryCalls(service).find((c) => c.name === name)!;

      await expect(call()).rejects.toBeInstanceOf(ForbiddenRequestError);
    }
  );

  test("no provider request is made when the actor is unauthorized", async () => {
    const { service } = makeService(createMongoAbility([]));

    await Promise.all(discoveryCalls(service).map(({ call }) => expect(call()).rejects.toThrow()));

    expect(ibmProviderFns.fetchOrganizations).not.toHaveBeenCalled();
    expect(ibmProviderFns.fetchOrganizationCatalogs).not.toHaveBeenCalled();
    expect(ibmProviderFns.fetchOrganizationApps).not.toHaveBeenCalled();
    expect(entraProviderFns.fetchAzureEntraIdUsers).not.toHaveBeenCalled();
  });

  test.each([
    ProjectPermissionDynamicSecretActions.CreateRootCredential,
    ProjectPermissionDynamicSecretActions.EditRootCredential
  ])("an actor holding %s in the project reaches the provider", async (action) => {
    const { service, getProjectPermission } = makeService(
      createMongoAbility([{ action, subject: ProjectPermissionSub.DynamicSecrets }])
    );

    await Promise.all(discoveryCalls(service).map(({ call }) => call()));

    expect(ibmProviderFns.fetchOrganizations).toHaveBeenCalledTimes(1);
    expect(ibmProviderFns.fetchOrganizationCatalogs).toHaveBeenCalledTimes(1);
    expect(ibmProviderFns.fetchOrganizationApps).toHaveBeenCalledTimes(1);
    expect(entraProviderFns.fetchAzureEntraIdUsers).toHaveBeenCalledTimes(1);
    expect(getProjectPermission).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROJECT_ID }));
  });

  // a role scoped to one environment or path still grants discovery, which has no environment to check against
  test("an actor whose create permission is scoped to one environment reaches the provider", async () => {
    const { service } = makeService(
      createMongoAbility([
        {
          action: ProjectPermissionDynamicSecretActions.CreateRootCredential,
          subject: ProjectPermissionSub.DynamicSecrets,
          conditions: { environment: "dev", secretPath: "/" }
        }
      ])
    );

    await expect(
      service.fetchIbmApiConnectOrgs({ ...ibmCredentials, projectSlug: PROJECT_SLUG, ...actorArgs })
    ).resolves.toEqual([]);
  });

  test("a project outside the actor's org is reported as not found", async () => {
    const { service } = makeService(createMongoAbility([]), null);

    await expect(
      service.fetchIbmApiConnectOrgs({ ...ibmCredentials, projectSlug: PROJECT_SLUG, ...actorArgs })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
