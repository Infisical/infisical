import { createMongoAbility } from "@casl/ability";
import { vi } from "vitest";

import {
  emitSecretRotationFailed,
  SECRET_ROTATION_FAILED_EVENT,
  SECRET_ROTATION_RESOURCE_TYPE
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-events";

import { AlertPermissionAction, TAlertContext } from "../alert-types";
import { TSecretRotationWithLocation } from "./secret-rotation-alert-dal";
import { secretRotationAlertProviderFactory } from "./secret-rotation-alert-provider";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com" })
}));

const ROTATION: TSecretRotationWithLocation = {
  rotationId: "rotation-1",
  rotationName: "prod-postgres-rotation",
  rotationType: "postgres-credentials",
  connectionId: "connection-1",
  folderId: "folder-1",
  orgId: "org-1",
  projectId: "proj-1",
  envSlug: "prod",
  envName: "Production"
};

const ATTEMPTED_AT = new Date("2026-11-03T00:00:05.000Z");

const buildProvider = (
  opts: {
    rotations?: TSecretRotationWithLocation[];
    rules?: { action: string; subject: string; conditions?: Record<string, unknown> }[];
    unresolvedPath?: boolean;
  } = {}
) => {
  const pathLookupOptions: unknown[] = [];
  const provider = secretRotationAlertProviderFactory({
    secretRotationAlertDAL: {
      findRotationsByIds: async (ids: string[]) =>
        (opts.rotations ?? [ROTATION]).filter((rotation) => ids.includes(rotation.rotationId)),
      findRotationNamesByIds: async (ids: string[], orgId: string) =>
        (opts.rotations ?? [ROTATION])
          .filter((rotation) => ids.includes(rotation.rotationId) && rotation.orgId === orgId)
          .map((rotation) => ({ id: rotation.rotationId, name: rotation.rotationName }))
    },
    folderDAL: {
      findSecretPathByFolderIds: async (_projectId: string, _folderIds: string[], _tx: unknown, options: unknown) => {
        pathLookupOptions.push(options);
        return opts.unresolvedPath ? [] : [{ id: "folder-1", path: "/databases" }];
      }
    } as never,
    permissionService: {
      getProjectPermission: async () => ({
        permission: createMongoAbility(
          (opts.rules ?? [
            { action: "read", subject: "secret-rotation" },
            { action: "edit", subject: "secret-rotation" }
          ]) as never
        )
      })
    } as never
  });
  return { provider, pathLookupOptions };
};

const alertContext: TAlertContext = {
  id: "alert-1",
  name: "Rotation failure alert",
  orgId: "org-1",
  projectId: "proj-1",
  resourceType: SECRET_ROTATION_RESOURCE_TYPE,
  resourceId: "rotation-1",
  eventType: SECRET_ROTATION_FAILED_EVENT,
  condition: null
};

const failedEvent = (overrides: Record<string, unknown> = {}) => ({
  orgId: "org-1",
  projectId: "proj-1",
  resourceId: "rotation-1",
  eventType: SECRET_ROTATION_FAILED_EVENT,
  condition: null,
  targetIds: ["rotation-1"],
  payload: { attemptedAt: ATTEMPTED_AT.toISOString() },
  ...overrides
});

const actor = { actor: "user", actorId: "user-1", actorAuthMethod: null, actorOrgId: "org-1" } as never;

describe("secret rotation alert provider", () => {
  test("delivers what the rotation failure path emits", async () => {
    let emitted: Record<string, unknown> | undefined;
    await emitSecretRotationFailed(
      {
        emit: async ([event]) => {
          emitted = event.data;
        }
      },
      { orgId: "org-1", projectId: "proj-1", rotationId: "rotation-1", attemptedAt: ATTEMPTED_AT },
      {} as never
    );

    expect(emitted).toMatchObject({
      resourceType: SECRET_ROTATION_RESOURCE_TYPE,
      resourceId: "rotation-1",
      targetIds: ["rotation-1"]
    });

    const { provider } = buildProvider();
    const targets = await provider.findEventTargets({
      ...failedEvent(),
      targetIds: emitted!.targetIds as string[],
      payload: emitted!
    });

    expect(targets).toHaveLength(1);
    expect(provider.targetId(targets[0])).toBe("rotation-1");
    expect(targets[0].attemptedAt).toEqual(ATTEMPTED_AT);
  });

  test("reads rotation paths from the primary", async () => {
    const { provider, pathLookupOptions } = buildProvider();
    await provider.findEventTargets(failedEvent());
    expect(pathLookupOptions).toEqual([{ readFromPrimary: true }]);
  });

  test("drops a rotation that is gone, sits in another project, or has no resolvable path", async () => {
    expect(await buildProvider({ rotations: [] }).provider.findEventTargets(failedEvent())).toEqual([]);
    expect(await buildProvider().provider.findEventTargets(failedEvent({ projectId: "proj-2" }))).toEqual([]);
    expect(await buildProvider({ unresolvedPath: true }).provider.findEventTargets(failedEvent())).toEqual([]);
  });

  test("rejects an unreadable payload instead of delivering a blank alert", async () => {
    const { provider } = buildProvider();
    await expect(provider.findEventTargets(failedEvent({ payload: {} }))).rejects.toThrow(
      `Unreadable '${SECRET_ROTATION_FAILED_EVENT}' payload`
    );
  });

  test("the payload names the rotation, provider, environment, path and attempt time", async () => {
    const { provider } = buildProvider();
    const targets = await provider.findEventTargets(failedEvent());
    const payload = provider.buildPayload(alertContext, targets, "https://view");

    expect(payload.summary).toBe("PostgreSQL Credentials rotation 'prod-postgres-rotation' failed in Production");
    expect(payload.items[0].fields).toEqual([
      { label: "Provider", value: "PostgreSQL Credentials" },
      { label: "Environment", value: "Production" },
      { label: "Path", value: "/databases" },
      { label: "Last Attempt", value: expect.any(String) }
    ]);
  });

  test("links to the rotation on the overview page", async () => {
    const { provider } = buildProvider();
    const url = new URL(await provider.buildViewUrl(alertContext));
    expect(url.pathname).toBe("/organizations/org-1/projects/secret-management/proj-1/overview");
    expect(url.searchParams.get("secretPath")).toBe("/databases");
    expect(url.searchParams.get("environments")).toBe(JSON.stringify(["prod"]));
    expect(url.searchParams.get("search")).toBe("prod-postgres-rotation");
  });

  test("changing an alert needs edit access to the rotation", async () => {
    const { provider } = buildProvider({ rules: [{ action: "read", subject: "secret-rotation" }] });
    await expect(
      provider.assertPermission({
        action: AlertPermissionAction.Edit,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "rotation-1",
        actor
      })
    ).rejects.toThrow();
  });

  test("checks edit access against the rotation's environment and path", async () => {
    const { provider } = buildProvider({
      rules: [{ action: "edit", subject: "secret-rotation", conditions: { environment: "staging" } }]
    });
    await expect(
      provider.assertPermission({
        action: AlertPermissionAction.Create,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "rotation-1",
        actor
      })
    ).rejects.toThrow();
  });

  test("a test send before the rotation exists needs permission to create rotations", async () => {
    const allowed = buildProvider({ rules: [{ action: "create", subject: "secret-rotation" }] }).provider;
    await expect(
      allowed.assertPermission({
        action: AlertPermissionAction.Create,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: null,
        actor
      })
    ).resolves.toBeUndefined();

    const denied = buildProvider({ rules: [{ action: "read", subject: "secret-rotation" }] }).provider;
    await expect(
      denied.assertPermission({
        action: AlertPermissionAction.Create,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: null,
        actor
      })
    ).rejects.toThrow();
  });

  test("rejects a rotation from another project or org as not found", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.assertResourceInScope({ orgId: "org-1", projectId: "proj-2", resourceId: "rotation-1" })
    ).rejects.toThrow("Secret rotation with ID 'rotation-1' not found in this project");
    await expect(
      provider.assertResourceInScope({ orgId: "org-2", projectId: "proj-1", resourceId: "rotation-1" })
    ).rejects.toThrow("not found in this project");
  });

  test("rejects an org-scoped rotation alert", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.assertResourceInScope({ orgId: "org-1", projectId: null, resourceId: "rotation-1" })
    ).rejects.toThrow("Secret rotation alerts must be managed within a project");
  });

  test("resolves the project from the rotation, and only within the caller's org", async () => {
    const { provider } = buildProvider();
    expect(await provider.resolveProjectId?.({ orgId: "org-1", resourceId: "rotation-1" })).toBe("proj-1");
    await expect(provider.resolveProjectId?.({ orgId: "org-2", resourceId: "rotation-1" })).rejects.toThrow(
      "Secret rotation with ID 'rotation-1' not found"
    );
  });

  test("getResourceNames returns rotation names only from the caller's org", async () => {
    const { provider } = buildProvider();
    expect(
      (await provider.getResourceNames?.({ orgId: "org-1", resourceIds: ["rotation-1"] }))?.get("rotation-1")
    ).toBe("prod-postgres-rotation");
    expect((await provider.getResourceNames?.({ orgId: "org-2", resourceIds: ["rotation-1"] }))?.size).toBe(0);
  });
});
