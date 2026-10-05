import { describe, expect, test, vi } from "vitest";

import { NotFoundError } from "@app/lib/errors";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

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
  parentOrgId: ACTOR_ORG_ID
};

class PermissionReached extends Error {}

const buildService = (connection: { orgId: string; projectId: string | null }) => {
  const permissionService = {
    getOrgPermission: vi.fn(async () => {
      throw new PermissionReached();
    }),
    getProjectPermission: vi.fn(async () => {
      throw new PermissionReached();
    })
  };

  const overrides: Record<string, unknown> = {
    appConnectionDAL: {
      findById: vi.fn(async () => ({ id: CONNECTION_ID, app: AppConnection.AWS, ...connection }))
    },
    permissionService,
    licenseService: { getPlan: vi.fn(async () => ({})) }
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
