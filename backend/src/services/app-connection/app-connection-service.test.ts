import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { OrgPermissionAppConnectionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { AppConnection } from "./app-connection-enums";
import { appConnectionServiceFactory } from "./app-connection-service";
import { AwsConnectionMethod } from "./aws";

vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const ACTOR_ORG_ID = "org-1";
const CONNECTION_ID = "conn-1";

const actor = {
  type: ActorType.USER,
  id: "user-1",
  authMethod: AuthMethod.EMAIL,
  orgId: ACTOR_ORG_ID,
  rootOrgId: ACTOR_ORG_ID,
  parentOrgId: ACTOR_ORG_ID
};

class PermissionReached extends Error {}

const buildService = (
  connection: { orgId: string; projectId: string | null; app?: AppConnection },
  abilities: { org?: unknown; project?: unknown } = {},
  rows: Record<string, unknown>[] = []
) => {
  const permissionService = {
    getOrgPermission: vi.fn(async () => {
      if (!abilities.org) throw new PermissionReached();
      return { permission: abilities.org };
    }),
    getProjectPermission: vi.fn(async () => {
      if (!abilities.project) throw new PermissionReached();
      return { permission: abilities.project };
    })
  };

  const overrides: Record<string, unknown> = {
    appConnectionDAL: {
      find: vi.fn(async () => rows),
      findById: vi.fn(async () => ({
        id: CONNECTION_ID,
        app: AppConnection.AWS,
        encryptedCredentials: Buffer.from("{}"),
        ...connection
      }))
    },
    projectDAL: { findProjectById: vi.fn(async (id: string) => ({ id, type: "cert-manager" })) },
    kmsService: {
      createCipherPairWithDataKey: vi.fn(async () => ({
        decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
      }))
    },
    permissionService,
    licenseService: new FakeLicenseService()
  };

  const deps = new Proxy(overrides, {
    get: (target, key: string) => (key in target ? target[key] : new Proxy({}, { get: () => vi.fn() }))
  });

  const service = appConnectionServiceFactory(deps as unknown as Parameters<typeof appConnectionServiceFactory>[0]);
  return { service, permissionService };
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
    const { service, permissionService } = buildService({ orgId: "org-2", projectId: null });

    const result = call(service);
    await expect(result).rejects.toBeInstanceOf(NotFoundError);
    await expect(result).rejects.toThrow(`Could not find App Connection with ID ${CONNECTION_ID}`);
    expect(permissionService.getOrgPermission).not.toHaveBeenCalled();
    expect(permissionService.getProjectPermission).not.toHaveBeenCalled();
  });

  test.each(CALLS)("%s: project connection in another org", async (_, call) => {
    const { service, permissionService } = buildService({ orgId: "org-2", projectId: "proj-2" });

    await expect(call(service)).rejects.toBeInstanceOf(NotFoundError);
    expect(permissionService.getOrgPermission).not.toHaveBeenCalled();
    expect(permissionService.getProjectPermission).not.toHaveBeenCalled();
  });

  test.each(CALLS)("%s: connection in the caller's org still reaches the permission check", async (_, call) => {
    const { service } = buildService({ orgId: ACTOR_ORG_ID, projectId: null });

    await expect(call(service)).rejects.toBeInstanceOf(PermissionReached);
  });
});

describe("validateAppConnectionUsageById refuses connections the caller cannot use", () => {
  const canConnectOrg = createMongoAbility([
    { action: OrgPermissionAppConnectionActions.Connect, subject: OrgPermissionSubjects.AppConnections }
  ]);
  const canConnectProject = createMongoAbility([
    { action: ProjectPermissionAppConnectionActions.Connect, subject: ProjectPermissionSub.AppConnections }
  ]);

  test("org connection without Connect permission", async () => {
    const { service } = buildService({ orgId: ACTOR_ORG_ID, projectId: null }, { org: createMongoAbility([]) });

    await expect(
      service.validateAppConnectionUsageById(
        AppConnection.AWS,
        { connectionId: CONNECTION_ID, projectId: "proj-1" },
        actor
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  test("project connection without Connect permission", async () => {
    const { service } = buildService({ orgId: ACTOR_ORG_ID, projectId: "proj-1" }, { project: createMongoAbility([]) });

    await expect(
      service.validateAppConnectionUsageById(
        AppConnection.AWS,
        { connectionId: CONNECTION_ID, projectId: "proj-1" },
        actor
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
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

describe("listAvailableAppConnectionsForUser", () => {
  const canConnectOrg = createMongoAbility([
    { action: OrgPermissionAppConnectionActions.Connect, subject: OrgPermissionSubjects.AppConnections }
  ]);

  const row = (id: string, name: string, configuration?: unknown, method = AwsConnectionMethod.AssumeRole) => ({
    id,
    name,
    app: AppConnection.AWS,
    method,
    orgId: ACTOR_ORG_ID,
    projectId: null,
    encryptedCredentials: Buffer.from("{}"),
    encryptedConfiguration: configuration === undefined ? null : Buffer.from(JSON.stringify(configuration))
  });

  const provisioning = {
    launchMethod: "launch-stack",
    useCases: ["secrets-manager", "parameter-store"],
    stackName: "infisical-secret-stack",
    partition: "aws",
    templateVersion: "1.0.0"
  };

  const listAws = async (rows: Record<string, unknown>[]) => {
    const { service } = buildService({ orgId: ACTOR_ORG_ID, projectId: null }, { org: canConnectOrg }, rows);
    return service.listAvailableAppConnectionsForUser(AppConnection.AWS, actor);
  };

  test("an AWS connection provisioned with Launch Stack carries only its recorded use cases", async () => {
    const [connection] = await listAws([row("c1", "stack", { provisioning })]);

    expect(connection).toMatchObject({ id: "c1", provisioning: { useCases: ["secrets-manager", "parameter-store"] } });
    expect(Object.keys(connection.provisioning ?? {})).toEqual(["useCases"]);
  });

  test("an AWS connection without provisioning information has no recorded use cases", async () => {
    const result = await listAws([
      row("c1", "manual"),
      row("c2", "manual-empty", {}),
      row("c3", "manual-null", { provisioning: null })
    ]);

    expect(result.map((connection) => connection.provisioning)).toEqual([null, null, null]);
  });

  test("an Access Key connection never carries recorded use cases", async () => {
    const [connection] = await listAws([row("c1", "keys", { provisioning }, AwsConnectionMethod.AccessKey)]);

    expect(connection.provisioning).toBeNull();
  });

  test("an unreadable stored configuration does not fail the list", async () => {
    const broken = { ...row("c1", "broken"), encryptedConfiguration: Buffer.from("not json") };

    const result = await listAws([broken, row("c2", "stack", { provisioning })]);

    expect(result.map((connection) => connection.provisioning?.useCases ?? null)).toEqual([
      null,
      ["secrets-manager", "parameter-store"]
    ]);
  });
});
