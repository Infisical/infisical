import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { vi } from "vitest";

import {
  emitSecretSyncFailed,
  SECRET_SYNC_FAILED_EVENT,
  SECRET_SYNC_RESOURCE_TYPE
} from "@app/services/secret-sync/secret-sync-events";
import { SecretSyncAction } from "@app/services/secret-sync/secret-sync-types";

import { formatUtcDate } from "../alert-format-fns";
import { AlertPermissionAction, TAlertContext } from "../alert-types";
import { TSecretSyncWithLocation } from "./secret-sync-alert-dal";
import { secretSyncAlertProviderFactory } from "./secret-sync-alert-provider";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com" })
}));

const SYNC: TSecretSyncWithLocation = {
  syncId: "sync-1",
  syncName: "prod-vercel-sync",
  destination: "vercel",
  connectionId: "connection-1",
  folderId: "folder-1",
  orgId: "org-1",
  projectId: "proj-1",
  envSlug: "prod",
  envName: "Production"
};

const DETACHED_SYNC: TSecretSyncWithLocation = {
  ...SYNC,
  syncId: "sync-2",
  syncName: "detached-sync",
  folderId: null,
  envSlug: null,
  envName: null
};

const ATTEMPTED_AT = new Date("2026-11-13T00:00:05.000Z");

const buildProvider = (
  opts: {
    syncs?: TSecretSyncWithLocation[];
    rules?: { action: string; subject: string; inverted?: boolean; conditions?: Record<string, unknown> }[];
    unresolvedPath?: boolean;
  } = {}
) => {
  const pathLookupOptions: unknown[] = [];
  const provider = secretSyncAlertProviderFactory({
    secretSyncAlertDAL: {
      findSyncsByIds: async (ids: string[]) => (opts.syncs ?? [SYNC]).filter((sync) => ids.includes(sync.syncId)),
      findSyncNamesByIds: async (ids: string[], orgId: string) =>
        (opts.syncs ?? [SYNC])
          .filter((sync) => ids.includes(sync.syncId) && sync.orgId === orgId)
          .map((sync) => ({ id: sync.syncId, name: sync.syncName }))
    },
    folderDAL: {
      findSecretPathByFolderIds: async (_projectId: string, _folderIds: string[], _tx: unknown, options: unknown) => {
        pathLookupOptions.push(options);
        return opts.unresolvedPath ? [] : [{ id: "folder-1", path: "/app" }];
      }
    } as never,
    permissionService: {
      getProjectPermission: async () => ({
        permission: createMongoAbility(
          (opts.rules ?? [
            { action: "read", subject: "secret-syncs" },
            { action: "edit", subject: "secret-syncs" }
          ]) as never
        )
      })
    } as never
  });
  return { provider, pathLookupOptions };
};

const alertContext: TAlertContext = {
  id: "alert-1",
  name: "Sync failure alert",
  orgId: "org-1",
  projectId: "proj-1",
  resourceType: SECRET_SYNC_RESOURCE_TYPE,
  resourceId: "sync-1",
  eventType: SECRET_SYNC_FAILED_EVENT,
  condition: null
};

const failedEvent = (overrides: Record<string, unknown> = {}) => ({
  orgId: "org-1",
  projectId: "proj-1",
  resourceId: "sync-1",
  eventType: SECRET_SYNC_FAILED_EVENT,
  condition: null,
  targetIds: ["sync-1"],
  payload: {
    action: SecretSyncAction.SyncSecrets,
    failureMessage: "Vercel returned 403",
    attemptedAt: ATTEMPTED_AT.toISOString()
  },
  ...overrides
});

const actor = { actor: "user", actorId: "user-1", actorAuthMethod: null, actorOrgId: "org-1" } as never;

const permissionInput = (action: AlertPermissionAction, resourceId: string | null = "sync-1") => ({
  action,
  orgId: "org-1",
  projectId: "proj-1",
  resourceId,
  actor
});

const emitFailure = async (failureMessage: string) => {
  let emitted: Record<string, unknown> | undefined;
  await emitSecretSyncFailed(
    {
      emit: async ([event]) => {
        emitted = event.data;
      }
    },
    {
      orgId: "org-1",
      projectId: "proj-1",
      syncId: "sync-1",
      action: SecretSyncAction.ImportSecrets,
      failureMessage,
      attemptedAt: ATTEMPTED_AT
    },
    {} as never
  );
  return emitted!;
};

describe("secret sync alert provider", () => {
  test("delivers what the sync failure path emits", async () => {
    const emitted = await emitFailure("Vercel returned 403");

    const { provider } = buildProvider();
    const targets = await provider.findEventTargets({
      ...failedEvent(),
      targetIds: emitted.targetIds as string[],
      payload: emitted
    });

    expect(targets).toHaveLength(1);
    expect(provider.targetId(targets[0])).toBe("sync-1");
    expect(targets[0]).toMatchObject({
      action: SecretSyncAction.ImportSecrets,
      failureMessage: "Vercel returned 403",
      attemptedAt: ATTEMPTED_AT
    });
  });

  test("truncates a long failure message before it reaches the outbox", async () => {
    const emitted = await emitFailure("x".repeat(10_000));

    expect((emitted.failureMessage as string).length).toBe(2000);
  });

  test("reads sync paths from the primary", async () => {
    const { provider, pathLookupOptions } = buildProvider();
    await provider.findEventTargets(failedEvent());
    expect(pathLookupOptions).toEqual([{ readFromPrimary: true }]);
  });

  test("drops a sync that is gone, sits in another project, or has an unresolvable path", async () => {
    expect(await buildProvider({ syncs: [] }).provider.findEventTargets(failedEvent())).toEqual([]);
    expect(await buildProvider().provider.findEventTargets(failedEvent({ projectId: "proj-2" }))).toEqual([]);
    expect(await buildProvider({ unresolvedPath: true }).provider.findEventTargets(failedEvent())).toEqual([]);
  });

  test("still alerts on a sync whose source folder was deleted", async () => {
    const { provider } = buildProvider({ syncs: [DETACHED_SYNC] });
    const targets = await provider.findEventTargets(failedEvent({ resourceId: "sync-2", targetIds: ["sync-2"] }));

    expect(targets).toHaveLength(1);
    const payload = provider.buildPayload(alertContext, targets, "https://view");
    expect(payload.items[0].fields).toEqual(
      expect.arrayContaining([
        { label: "Environment", value: "-" },
        { label: "Path", value: "-" }
      ])
    );
  });

  test("rejects an unreadable payload instead of delivering a blank alert", async () => {
    const { provider } = buildProvider();
    await expect(provider.findEventTargets(failedEvent({ payload: {} }))).rejects.toThrow(
      `Unreadable '${SECRET_SYNC_FAILED_EVENT}' payload`
    );
  });

  test("the payload names the sync, destination, action, environment, path, error and attempt time", async () => {
    const { provider } = buildProvider();
    const targets = await provider.findEventTargets(failedEvent());
    const payload = provider.buildPayload(alertContext, targets, "https://view");

    // Channels render "<resourceKind> <eventLabel> Alert", so the label must not repeat "Sync".
    expect(`${payload.resourceKind} ${payload.eventLabel}`).toBe("Secret Sync Failure");
    expect(payload.summary).toBe("Vercel sync 'prod-vercel-sync' failed to sync secrets");
    expect(payload.items[0].fields).toEqual([
      { label: "Destination", value: "Vercel" },
      { label: "Action", value: "Sync" },
      { label: "Environment", value: "Production" },
      { label: "Path", value: "/app" },
      { label: "Error", value: "Vercel returned 403" },
      { label: "Last Attempt", value: formatUtcDate(ATTEMPTED_AT) }
    ]);
  });

  test("links to the sync's page", async () => {
    const { provider } = buildProvider();
    const url = new URL(await provider.buildViewUrl(alertContext));
    expect(url.pathname).toBe(
      "/organizations/org-1/projects/secret-management/proj-1/integrations/secret-syncs/vercel/sync-1"
    );
  });

  test("changing an alert needs edit access to the sync", async () => {
    const { provider } = buildProvider({ rules: [{ action: "read", subject: "secret-syncs" }] });
    await expect(provider.assertPermission(permissionInput(AlertPermissionAction.Edit))).rejects.toThrow();
  });

  test("checks edit access against the sync's environment and path", async () => {
    const { provider } = buildProvider({
      rules: [{ action: "edit", subject: "secret-syncs", conditions: { environment: "staging" } }]
    });
    await expect(provider.assertPermission(permissionInput(AlertPermissionAction.Create))).rejects.toThrow();
  });

  test("checks edit access against the sync's connection", async () => {
    const { provider } = buildProvider({
      rules: [{ action: "edit", subject: "secret-syncs", conditions: { connectionId: "connection-2" } }]
    });
    await expect(provider.assertPermission(permissionInput(AlertPermissionAction.Edit))).rejects.toThrow();
  });

  describe("listing a project's sync alerts without naming a sync", () => {
    // A CASL error is what the permission-denied audit hook records, with the action and subject it names.
    const expectAuditableReadDenial = async (result: Promise<void>) => {
      const error = await result.catch((err: unknown) => err);
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error).toMatchObject({ action: "read", subjectType: "secret-syncs" });
    };

    const listInput = permissionInput(AlertPermissionAction.Read, null);

    test("is refused when sync read is limited to some environments", async () => {
      const { provider } = buildProvider({
        rules: [{ action: "read", subject: "secret-syncs", conditions: { environment: "staging" } }]
      });
      await expectAuditableReadDenial(provider.assertPermission(listInput));
    });

    test("is refused when a deny rule narrows an otherwise project-wide read", async () => {
      const { provider } = buildProvider({
        rules: [
          { action: "read", subject: "secret-syncs" },
          { action: "read", subject: "secret-syncs", inverted: true, conditions: { environment: "prod" } }
        ]
      });
      await expectAuditableReadDenial(provider.assertPermission(listInput));
    });

    test("is allowed when the caller can read every sync in the project", async () => {
      const { provider } = buildProvider({ rules: [{ action: "read", subject: "secret-syncs" }] });
      await expect(provider.assertPermission(listInput)).resolves.toBeUndefined();
    });
  });

  test("a test send before the sync exists needs permission to create syncs", async () => {
    const allowed = buildProvider({ rules: [{ action: "create", subject: "secret-syncs" }] }).provider;
    await expect(
      allowed.assertPermission(permissionInput(AlertPermissionAction.Create, null))
    ).resolves.toBeUndefined();

    const denied = buildProvider({ rules: [{ action: "read", subject: "secret-syncs" }] }).provider;
    await expect(denied.assertPermission(permissionInput(AlertPermissionAction.Create, null))).rejects.toThrow();
  });

  test("rejects a sync from another project or org as not found", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.assertResourceInScope({ orgId: "org-1", projectId: "proj-2", resourceId: "sync-1" })
    ).rejects.toThrow("Secret sync with ID 'sync-1' not found in this project");
    await expect(
      provider.assertResourceInScope({ orgId: "org-2", projectId: "proj-1", resourceId: "sync-1" })
    ).rejects.toThrow("not found in this project");
  });

  test("rejects an org-scoped sync alert", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.assertResourceInScope({ orgId: "org-1", projectId: null, resourceId: "sync-1" })
    ).rejects.toThrow("Secret sync alerts must be managed within a project");
  });

  test("resolves the project from the sync, and only within the caller's org", async () => {
    const { provider } = buildProvider();
    expect(await provider.resolveProjectId?.({ orgId: "org-1", resourceId: "sync-1" })).toBe("proj-1");
    await expect(provider.resolveProjectId?.({ orgId: "org-2", resourceId: "sync-1" })).rejects.toThrow(
      "Secret sync with ID 'sync-1' not found"
    );
  });

  test("getResourceNames returns sync names only from the caller's org", async () => {
    const { provider } = buildProvider();
    expect((await provider.getResourceNames?.({ orgId: "org-1", resourceIds: ["sync-1"] }))?.get("sync-1")).toBe(
      "prod-vercel-sync"
    );
    expect((await provider.getResourceNames?.({ orgId: "org-2", resourceIds: ["sync-1"] }))?.size).toBe(0);
  });
});
