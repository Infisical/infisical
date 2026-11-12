import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { vi } from "vitest";

import {
  emitHoneyTokenTriggered,
  HONEY_TOKEN_RESOURCE_TYPE,
  HONEY_TOKEN_TRIGGERED_EVENT
} from "@app/ee/services/honey-token/honey-token-events";

import { formatUtcDate } from "../alert-format-fns";
import { AlertPermissionAction, TAlertContext } from "../alert-types";
import { THoneyTokenWithLocation } from "./honey-token-alert-dal";
import { honeyTokenAlertProviderFactory } from "./honey-token-alert-provider";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com" })
}));

const HONEY_TOKEN: THoneyTokenWithLocation = {
  honeyTokenId: "honey-token-1",
  honeyTokenName: "prod-aws-decoy",
  honeyTokenType: "aws",
  honeyTokenStatus: "active",
  folderId: "folder-1",
  orgId: "org-1",
  projectId: "proj-1",
  envSlug: "prod",
  envName: "Production"
};

const TRIGGERED_AT = new Date("2026-11-12T10:15:00.000Z");

const TRIGGER = {
  triggeredAt: TRIGGERED_AT.toISOString(),
  eventName: "GetCallerIdentity",
  eventTime: "2026-11-12T10:14:58Z",
  sourceIp: "203.0.113.7",
  awsRegion: "us-east-1"
};

const buildProvider = (
  opts: {
    honeyTokens?: THoneyTokenWithLocation[];
    rules?: { action: string; subject: string; inverted?: boolean; conditions?: Record<string, unknown> }[];
    unresolvedPath?: boolean;
  } = {}
) => {
  const pathLookupOptions: unknown[] = [];
  const provider = honeyTokenAlertProviderFactory({
    honeyTokenAlertDAL: {
      findHoneyTokensByIds: async (ids: string[]) =>
        (opts.honeyTokens ?? [HONEY_TOKEN]).filter((honeyToken) => ids.includes(honeyToken.honeyTokenId)),
      findHoneyTokenNamesByIds: async (ids: string[], orgId: string) =>
        (opts.honeyTokens ?? [HONEY_TOKEN])
          .filter((honeyToken) => ids.includes(honeyToken.honeyTokenId) && honeyToken.orgId === orgId)
          .map((honeyToken) => ({ id: honeyToken.honeyTokenId, name: honeyToken.honeyTokenName }))
    },
    folderDAL: {
      findSecretPathByFolderIds: async (_projectId: string, _folderIds: string[], _tx: unknown, options: unknown) => {
        pathLookupOptions.push(options);
        return opts.unresolvedPath ? [] : [{ id: "folder-1", path: "/aws" }];
      }
    } as never,
    permissionService: {
      getProjectPermission: async () => ({
        permission: createMongoAbility(
          (opts.rules ?? [
            { action: "read", subject: "honey-tokens" },
            { action: "edit", subject: "honey-tokens" }
          ]) as never
        )
      })
    } as never
  });
  return { provider, pathLookupOptions };
};

const alertContext: TAlertContext = {
  id: "alert-1",
  name: "Honey token trigger alert",
  orgId: "org-1",
  projectId: "proj-1",
  resourceType: HONEY_TOKEN_RESOURCE_TYPE,
  resourceId: "honey-token-1",
  eventType: HONEY_TOKEN_TRIGGERED_EVENT,
  condition: null
};

const triggeredEvent = (overrides: Record<string, unknown> = {}) => ({
  orgId: "org-1",
  projectId: "proj-1",
  resourceId: "honey-token-1",
  eventType: HONEY_TOKEN_TRIGGERED_EVENT,
  condition: null,
  targetIds: ["honey-token-1"],
  payload: TRIGGER,
  ...overrides
});

const actor = { actor: "user", actorId: "user-1", actorAuthMethod: null, actorOrgId: "org-1" } as never;

const permissionInput = (action: AlertPermissionAction, resourceId: string | null = "honey-token-1") => ({
  action,
  orgId: "org-1",
  projectId: "proj-1",
  resourceId,
  actor
});

const captureEmitted = async (input: Partial<Parameters<typeof emitHoneyTokenTriggered>[1]> = {}) => {
  let emitted: Record<string, unknown> | undefined;
  await emitHoneyTokenTriggered(
    {
      emit: async ([event]) => {
        emitted = event.data;
      }
    },
    {
      orgId: "org-1",
      projectId: "proj-1",
      honeyTokenId: "honey-token-1",
      triggeredAt: TRIGGERED_AT,
      eventName: TRIGGER.eventName,
      eventTime: TRIGGER.eventTime,
      sourceIp: TRIGGER.sourceIp,
      awsRegion: TRIGGER.awsRegion,
      ...input
    },
    {} as never
  );
  return emitted!;
};

describe("honey token alert provider", () => {
  test("delivers what the trigger path emits", async () => {
    const emitted = await captureEmitted();

    const { provider } = buildProvider();
    const targets = await provider.findEventTargets({
      ...triggeredEvent(),
      targetIds: emitted.targetIds as string[],
      payload: emitted
    });

    expect(targets).toHaveLength(1);
    expect(provider.targetId(targets[0])).toBe("honey-token-1");
    expect(targets[0].trigger.triggeredAt).toEqual(TRIGGERED_AT);
  });

  test("caps oversized trigger fields at emit so the outbox insert can't fail the trigger", async () => {
    const emitted = await captureEmitted({ eventName: "x".repeat(10_000), sourceIp: undefined });
    expect((emitted.eventName as string).length).toBe(256);
    expect(emitted.sourceIp).toBeNull();
  });

  test("reads honey token paths from the primary, including environments awaiting deletion", async () => {
    const { provider, pathLookupOptions } = buildProvider();
    await provider.findEventTargets(triggeredEvent());
    expect(pathLookupOptions).toEqual([{ readFromPrimary: true, includePendingDeletion: true }]);
  });

  test("drops a token that is gone, sits in another project, or has no resolvable path", async () => {
    expect(await buildProvider({ honeyTokens: [] }).provider.findEventTargets(triggeredEvent())).toEqual([]);
    expect(await buildProvider().provider.findEventTargets(triggeredEvent({ projectId: "proj-2" }))).toEqual([]);
    expect(await buildProvider({ unresolvedPath: true }).provider.findEventTargets(triggeredEvent())).toEqual([]);
  });

  test("rejects an unreadable payload instead of delivering a blank alert", async () => {
    const { provider } = buildProvider();
    await expect(provider.findEventTargets(triggeredEvent({ payload: {} }))).rejects.toThrow(
      `Unreadable '${HONEY_TOKEN_TRIGGERED_EVENT}' payload`
    );
  });

  test("the payload names the token, environment, path and what the caller did", async () => {
    const { provider } = buildProvider();
    const targets = await provider.findEventTargets(triggeredEvent());
    const payload = provider.buildPayload(alertContext, targets, "https://view");

    expect(`${payload.resourceKind} ${payload.eventLabel}`).toBe("Honey Token Triggered");
    expect(payload.severity).toBe("critical");
    expect(payload.summary).toBe("Honey token 'prod-aws-decoy' was used in Production");
    expect(payload.items[0].fields).toEqual([
      { label: "Provider", value: "AWS" },
      { label: "Environment", value: "Production" },
      { label: "Path", value: "/aws" },
      { label: "Action", value: "GetCallerIdentity" },
      { label: "Source IP", value: "203.0.113.7" },
      { label: "Region", value: "us-east-1" },
      { label: "Event Time", value: formatUtcDate(new Date(TRIGGER.eventTime)) },
      { label: "Triggered At", value: formatUtcDate(TRIGGERED_AT) }
    ]);
  });

  test("shows an event time that isn't a date as the provider sent it", async () => {
    const { provider } = buildProvider();
    const targets = await provider.findEventTargets(triggeredEvent({ payload: { ...TRIGGER, eventTime: "soon" } }));
    const fields = provider.buildPayload(alertContext, targets, "https://view").items[0].fields ?? [];
    expect(fields).toContainEqual({ label: "Event Time", value: "soon" });
  });

  test("shows an unknown source IP and leaves out a missing region", async () => {
    const { provider } = buildProvider();
    const targets = await provider.findEventTargets(
      triggeredEvent({ payload: { ...TRIGGER, sourceIp: null, awsRegion: null } })
    );
    const fields = provider.buildPayload(alertContext, targets, "https://view").items[0].fields ?? [];
    expect(fields).toContainEqual({ label: "Source IP", value: "Unknown" });
    expect(fields.map((field) => field.label)).not.toContain("Region");
  });

  test("links to the token's details on the overview page", async () => {
    const { provider } = buildProvider();
    const url = new URL(await provider.buildViewUrl(alertContext));
    expect(url.pathname).toBe("/organizations/org-1/projects/secret-management/proj-1/overview");
    expect(url.searchParams.get("honeyTokenId")).toBe("honey-token-1");
    expect(url.searchParams.get("secretPath")).toBe("/aws");
  });

  test("changing an alert needs edit access to the token", async () => {
    const { provider } = buildProvider({ rules: [{ action: "read", subject: "honey-tokens" }] });
    await expect(provider.assertPermission(permissionInput(AlertPermissionAction.Edit))).rejects.toThrow();
  });

  test("checks edit access against the token's environment and path", async () => {
    const { provider } = buildProvider({
      rules: [{ action: "edit", subject: "honey-tokens", conditions: { environment: "staging" } }]
    });
    await expect(provider.assertPermission(permissionInput(AlertPermissionAction.Create))).rejects.toThrow();

    const allowed = buildProvider({
      rules: [{ action: "edit", subject: "honey-tokens", conditions: { environment: "prod", secretPath: "/aws" } }]
    }).provider;
    await expect(allowed.assertPermission(permissionInput(AlertPermissionAction.Create))).resolves.toBeUndefined();
  });

  describe("listing a project's honey token alerts without naming a token", () => {
    const expectAuditableReadDenial = async (result: Promise<void>) => {
      const error = await result.catch((err: unknown) => err);
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error).toMatchObject({ action: "read", subjectType: "honey-tokens" });
    };

    const listInput = permissionInput(AlertPermissionAction.Read, null);

    test("is refused when honey token read is limited to some environments", async () => {
      const { provider } = buildProvider({
        rules: [{ action: "read", subject: "honey-tokens", conditions: { environment: "staging" } }]
      });
      await expectAuditableReadDenial(provider.assertPermission(listInput));
    });

    test("is refused when a deny rule narrows an otherwise project-wide read", async () => {
      const { provider } = buildProvider({
        rules: [
          { action: "read", subject: "honey-tokens" },
          { action: "read", subject: "honey-tokens", inverted: true, conditions: { environment: "prod" } }
        ]
      });
      await expectAuditableReadDenial(provider.assertPermission(listInput));
    });

    test("is allowed when the caller can read every honey token in the project", async () => {
      const { provider } = buildProvider({ rules: [{ action: "read", subject: "honey-tokens" }] });
      await expect(provider.assertPermission(listInput)).resolves.toBeUndefined();
    });
  });

  test("a test send before the token exists needs permission to create honey tokens", async () => {
    const allowed = buildProvider({ rules: [{ action: "create", subject: "honey-tokens" }] }).provider;
    await expect(
      allowed.assertPermission(permissionInput(AlertPermissionAction.Create, null))
    ).resolves.toBeUndefined();

    const denied = buildProvider({ rules: [{ action: "read", subject: "honey-tokens" }] }).provider;
    await expect(denied.assertPermission(permissionInput(AlertPermissionAction.Create, null))).rejects.toThrow();
  });

  test("rejects a token from another project or org as not found", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.assertResourceInScope({ orgId: "org-1", projectId: "proj-2", resourceId: "honey-token-1" })
    ).rejects.toThrow("Honey token with ID 'honey-token-1' not found in this project");
    await expect(
      provider.assertResourceInScope({ orgId: "org-2", projectId: "proj-1", resourceId: "honey-token-1" })
    ).rejects.toThrow("not found in this project");
  });

  test("refuses an alert for a revoked token, which can no longer trigger", async () => {
    const { provider } = buildProvider({ honeyTokens: [{ ...HONEY_TOKEN, honeyTokenStatus: "revoked" }] });
    await expect(
      provider.assertResourceInScope({ orgId: "org-1", projectId: "proj-1", resourceId: "honey-token-1" })
    ).rejects.toThrow("Honey token 'prod-aws-decoy' is revoked");
  });

  test("rejects an org-scoped honey token alert", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.assertResourceInScope({ orgId: "org-1", projectId: null, resourceId: "honey-token-1" })
    ).rejects.toThrow("Honey token alerts must be managed within a project");
  });

  test("accepts project admins as recipients", () => {
    expect(buildProvider().provider.recipientPolicy?.allowProjectAdmins).toBe(true);
  });

  test("resolves the project from the token, and only within the caller's org", async () => {
    const { provider } = buildProvider();
    expect(await provider.resolveProjectId?.({ orgId: "org-1", resourceId: "honey-token-1" })).toBe("proj-1");
    await expect(provider.resolveProjectId?.({ orgId: "org-2", resourceId: "honey-token-1" })).rejects.toThrow(
      "Honey token with ID 'honey-token-1' not found"
    );
  });

  test("getResourceNames returns token names only from the caller's org", async () => {
    const { provider } = buildProvider();
    expect(
      (await provider.getResourceNames?.({ orgId: "org-1", resourceIds: ["honey-token-1"] }))?.get("honey-token-1")
    ).toBe("prod-aws-decoy");
    expect((await provider.getResourceNames?.({ orgId: "org-2", resourceIds: ["honey-token-1"] }))?.size).toBe(0);
  });
});
