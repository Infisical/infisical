import { describe, expect, test, vi } from "vitest";

import { PermissionDeniedError } from "@app/domains/lib/errors";
import { Permission } from "@app/domains/platform/access-control/ce/module";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import {
  OrgPermissionAppConnectionActions,
  OrgPermissionSubjects
} from "@app/domains/platform/organizations/ce/module";
import { ProjectPermissionAppConnectionActions, ProjectPermissionSub } from "@app/domains/platform/projects/ce/module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TRequestActor } from "@app/lib/types";

import { AppConnection } from "./app-connection-enums";
import { appConnectionServiceFactory } from "./app-connection-service";

const ACTOR_ORG_ID = "org-1";
const CONNECTION_ID = "conn-1";

const actor = {
  type: ActorType.USER,
  id: "user-1",
  authMethod: AuthMethod.EMAIL,
  orgId: ACTOR_ORG_ID,
  rootOrgId: ACTOR_ORG_ID,
  parentOrgId: ACTOR_ORG_ID,
  principal: {
    type: ActorType.USER,
    id: "user-1",
    username: "user",
    email: null,
    authMethod: AuthMethod.EMAIL,
    isSuperAdmin: false
  },
  org: {
    id: ACTOR_ORG_ID,
    name: "org",
    rootOrgId: ACTOR_ORG_ID,
    parentOrgId: ACTOR_ORG_ID,
    shouldUseNewPrivilegeSystem: true,
    ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: false }
  },
  plan: async () => ({})
} as unknown as TRequestActor;

class PermissionReached extends Error {}

const buildService = (
  connection: { orgId: string; projectId: string | null; app?: AppConnection },
  abilities: { org?: unknown; project?: unknown } = {},
  extraDeps: Record<string, unknown> = {}
) => {
  const orgPermissionService = {
    getOrgPermission: vi.fn(async () => {
      if (!abilities.org) throw new PermissionReached();
      return abilities.org;
    })
  };
  const projectPermissionService = {
    getProjectPermission: vi.fn(async () => {
      if (!abilities.project) throw new PermissionReached();
      return abilities.project;
    })
  };

  const connectionRowLock = vi.fn();
  const connectionRowQuery = {
    where: vi.fn(() => connectionRowQuery),
    forUpdate: vi.fn(() => {
      connectionRowLock();
      return connectionRowQuery;
    }),
    first: vi.fn(async () => ({ id: CONNECTION_ID }))
  };
  const connectionRowTx = Object.assign(
    vi.fn(() => connectionRowQuery),
    { raw: vi.fn() }
  );

  const appConnectionDAL = {
    findById: vi.fn(async () => ({
      id: CONNECTION_ID,
      app: AppConnection.AWS,
      encryptedCredentials: Buffer.from("{}"),
      ...connection
    })),
    deleteById: vi.fn(),
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(connectionRowTx))
  };

  const overrides: Record<string, unknown> = {
    appConnectionDAL,
    projectDAL: { findProjectById: vi.fn(async (id: string) => ({ id, type: "cert-manager" })) },
    kmsDataKeyService: {
      createCipherPairWithDataKey: vi.fn(async () => ({
        decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
      }))
    },
    orgPermissionService,
    projectPermissionService,
    licenseService: new FakeLicenseService(),
    ...extraDeps
  };

  const deps = new Proxy(overrides, {
    get: (target, key: string) => (key in target ? target[key] : new Proxy({}, { get: () => vi.fn() }))
  });

  const service = appConnectionServiceFactory(deps as unknown as Parameters<typeof appConnectionServiceFactory>[0]);
  return {
    service,
    orgPermissionService,
    projectPermissionService,
    appConnectionDAL,
    connectionRowLock,
    connectionRowTx
  };
};

type TService = ReturnType<typeof buildService>["service"];

const CALLS: [string, (service: TService) => Promise<unknown>][] = [
  ["findAppConnectionById", (s) => s.findAppConnectionById(AppConnection.AWS, CONNECTION_ID, actor)],
  ["updateAppConnection", (s) => s.updateAppConnection(AppConnection.AWS, { connectionId: CONNECTION_ID }, actor)],
  ["deleteAppConnection", (s) => s.deleteAppConnection(AppConnection.AWS, CONNECTION_ID, actor)],
  ["connectAppConnectionById", (s) => s.connectAppConnectionById(AppConnection.AWS, CONNECTION_ID, actor)],
  [
    "validateAppConnectionUsageById",
    (s) =>
      s.validateAppConnectionUsageById(AppConnection.AWS, { connectionId: CONNECTION_ID, projectId: "proj-1" }, actor)
  ],
  ["findAppConnectionUsageById", (s) => s.findAppConnectionUsageById(AppConnection.AWS, CONNECTION_ID, actor)],
  [
    "triggerCredentialRotation",
    (s) => s.triggerCredentialRotation({ app: AppConnection.AWS, connectionId: CONNECTION_ID }, actor)
  ]
];

describe("app connection in another org reads as missing", () => {
  test.each(CALLS)("%s: org-level connection in another org", async (_, call) => {
    const { service, orgPermissionService, projectPermissionService } = buildService({
      orgId: "org-2",
      projectId: null
    });

    const result = call(service);
    await expect(result).rejects.toBeInstanceOf(NotFoundError);
    await expect(result).rejects.toThrow(`Could not find App Connection with ID ${CONNECTION_ID}`);
    expect(orgPermissionService.getOrgPermission).not.toHaveBeenCalled();
    expect(projectPermissionService.getProjectPermission).not.toHaveBeenCalled();
  });

  test.each(CALLS)("%s: project connection in another org", async (_, call) => {
    const { service, orgPermissionService, projectPermissionService } = buildService({
      orgId: "org-2",
      projectId: "proj-2"
    });

    await expect(call(service)).rejects.toBeInstanceOf(NotFoundError);
    expect(orgPermissionService.getOrgPermission).not.toHaveBeenCalled();
    expect(projectPermissionService.getProjectPermission).not.toHaveBeenCalled();
  });

  test.each(CALLS)("%s: connection in the caller's org still reaches the permission check", async (_, call) => {
    const { service } = buildService({ orgId: ACTOR_ORG_ID, projectId: null });

    await expect(call(service)).rejects.toBeInstanceOf(PermissionReached);
  });
});

describe("validateAppConnectionUsageById refuses connections the caller cannot use", () => {
  const canConnectOrg = Permission.fromRules({
    rules: [{ action: OrgPermissionAppConnectionActions.Connect, subject: OrgPermissionSubjects.AppConnections }]
  });
  const canConnectProject = Permission.fromRules({
    rules: [{ action: ProjectPermissionAppConnectionActions.Connect, subject: ProjectPermissionSub.AppConnections }]
  });

  test("org connection without Connect permission", async () => {
    const { service } = buildService({ orgId: ACTOR_ORG_ID, projectId: null }, { org: Permission.none() });

    await expect(
      service.validateAppConnectionUsageById(
        AppConnection.AWS,
        { connectionId: CONNECTION_ID, projectId: "proj-1" },
        actor
      )
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  test("project connection without Connect permission", async () => {
    const { service } = buildService({ orgId: ACTOR_ORG_ID, projectId: "proj-1" }, { project: Permission.none() });

    await expect(
      service.validateAppConnectionUsageById(
        AppConnection.AWS,
        { connectionId: CONNECTION_ID, projectId: "proj-1" },
        actor
      )
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  test("project connection from another project, even with Connect there", async () => {
    const { service } = buildService({ orgId: ACTOR_ORG_ID, projectId: "proj-2" }, { project: canConnectProject });

    await expect(
      service.validateAppConnectionUsageById(
        AppConnection.AWS,
        { connectionId: CONNECTION_ID, projectId: "proj-1" },
        actor
      )
    ).rejects.toThrow(BadRequestError);
    await expect(
      service.validateAppConnectionUsageById(
        AppConnection.AWS,
        { connectionId: CONNECTION_ID, projectId: "proj-1" },
        actor
      )
    ).rejects.toThrow(/from project with ID "proj-2" to project with ID "proj-1"/);
  });

  test("project connection in the same project with Connect passes", async () => {
    const { service } = buildService({ orgId: ACTOR_ORG_ID, projectId: "proj-1" }, { project: canConnectProject });

    await expect(
      service.validateAppConnectionUsageById(
        AppConnection.AWS,
        { connectionId: CONNECTION_ID, projectId: "proj-1" },
        actor
      )
    ).resolves.toMatchObject({ id: CONNECTION_ID, projectId: "proj-1" });
  });

  test("org connection with Connect passes", async () => {
    const { service } = buildService({ orgId: ACTOR_ORG_ID, projectId: null }, { org: canConnectOrg });

    await expect(
      service.validateAppConnectionUsageById(
        AppConnection.AWS,
        { connectionId: CONNECTION_ID, projectId: "proj-1" },
        actor
      )
    ).resolves.toMatchObject({ id: CONNECTION_ID });
  });

  test("connection of the wrong type, even with Connect", async () => {
    const { service } = buildService(
      { orgId: ACTOR_ORG_ID, projectId: null, app: AppConnection.AWS },
      { org: canConnectOrg }
    );

    await expect(
      service.validateAppConnectionUsageById(
        AppConnection.Venafi,
        { connectionId: CONNECTION_ID, projectId: "proj-1" },
        actor
      )
    ).rejects.toThrow(BadRequestError);
  });
});

describe("deleteAppConnection", () => {
  test("refuses to delete a connection a DigiCert CA validates domains through", async () => {
    const { service, appConnectionDAL } = buildService(
      { orgId: ACTOR_ORG_ID, projectId: null },
      {
        org: Permission.fromRules({
          rules: [{ action: OrgPermissionAppConnectionActions.Delete, subject: OrgPermissionSubjects.AppConnections }]
        })
      },
      {
        externalCertificateAuthorityDAL: {
          findDigiCertCaNamesByDnsZoneConnectionId: vi.fn(async () => ["digicert-ca"])
        }
      }
    );

    await expect(service.deleteAppConnection(AppConnection.AWS, CONNECTION_ID, actor)).rejects.toThrow(BadRequestError);
    expect(appConnectionDAL.deleteById).not.toHaveBeenCalled();
  });

  test("checks for linked DigiCert DNS zones under the connection row lock and checks deferred keys before the delete returns", async () => {
    const callOrder: string[] = [];
    const findDigiCertCaNamesByDnsZoneConnectionId = vi.fn(async () => {
      callOrder.push("guard");
      return [];
    });
    const { service, appConnectionDAL, connectionRowLock, connectionRowTx } = buildService(
      { orgId: ACTOR_ORG_ID, projectId: null },
      {
        org: Permission.fromRules({
          rules: [{ action: OrgPermissionAppConnectionActions.Delete, subject: OrgPermissionSubjects.AppConnections }]
        })
      },
      { externalCertificateAuthorityDAL: { findDigiCertCaNamesByDnsZoneConnectionId } }
    );
    connectionRowLock.mockImplementation(() => callOrder.push("lock"));
    connectionRowTx.raw.mockImplementation(async (sql: string) => {
      callOrder.push(sql);
    });
    appConnectionDAL.deleteById.mockImplementation(async () => {
      callOrder.push("delete");
      return { id: CONNECTION_ID, app: AppConnection.AWS, encryptedCredentials: Buffer.from("{}") };
    });

    await service.deleteAppConnection(AppConnection.AWS, CONNECTION_ID, actor).catch(() => undefined);

    expect(callOrder).toEqual(["lock", "guard", "SET CONSTRAINTS ALL IMMEDIATE", "delete"]);
    expect(findDigiCertCaNamesByDnsZoneConnectionId).toHaveBeenCalledWith(CONNECTION_ID, connectionRowTx);
    expect(appConnectionDAL.deleteById).toHaveBeenCalledWith(CONNECTION_ID, connectionRowTx);
  });

  test("checks DigiCert DNS zones by the stored connection ID, not the spelling in the request", async () => {
    const findDigiCertCaNamesByDnsZoneConnectionId = vi.fn(async (id: string) =>
      id === CONNECTION_ID ? ["digicert-ca"] : []
    );
    const { service, appConnectionDAL } = buildService(
      { orgId: ACTOR_ORG_ID, projectId: null },
      {
        org: Permission.fromRules({
          rules: [{ action: OrgPermissionAppConnectionActions.Delete, subject: OrgPermissionSubjects.AppConnections }]
        })
      },
      { externalCertificateAuthorityDAL: { findDigiCertCaNamesByDnsZoneConnectionId } }
    );

    await expect(service.deleteAppConnection(AppConnection.AWS, CONNECTION_ID.toUpperCase(), actor)).rejects.toThrow(
      BadRequestError
    );
    expect(findDigiCertCaNamesByDnsZoneConnectionId).toHaveBeenCalledWith(CONNECTION_ID, expect.anything());
    expect(appConnectionDAL.deleteById).not.toHaveBeenCalled();
  });
});
