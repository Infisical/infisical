import { z } from "zod";

import { AlertChannelType, TAlertPayload } from "./alert-channel-types";
import { alertProviderRegistryFactory } from "./alert-provider-registry";
import { alertServiceFactory, TAlertServiceFactoryDep } from "./alert-service";
import { IResourceAlertProvider, TAlertPermissionInput } from "./alert-types";

const RESOURCE_TYPE = "test.resource";

type TChannelRow = {
  id: string;
  name: string;
  channelType: AlertChannelType;
  enabled: boolean;
  orgId: string;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const channelRow = (over: Partial<TChannelRow> & { id: string; channelType: AlertChannelType }): TChannelRow => ({
  name: over.id,
  enabled: true,
  orgId: "org-1",
  projectId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over
});

const buildService = (opts?: {
  assertPermission?: (input: TAlertPermissionInput) => Promise<void>;
  resourceScopeThrows?: boolean;
  channels?: TChannelRow[];
}) => {
  const permissionCalls: TAlertPermissionInput[] = [];
  const provider: IResourceAlertProvider = {
    resourceType: RESOURCE_TYPE,
    eventTypes: ["test.resource.expiration"],
    conditionSchema: z.object({ alertBefore: z.string() }),
    findDueTargets: async () => [],
    buildViewUrl: async () => "https://app.infisical.com/x",
    buildPayload: () => ({}) as TAlertPayload,
    targetId: () => "t",
    assertPermission: async (input) => {
      permissionCalls.push(input);
      if (opts?.assertPermission) await opts.assertPermission(input);
    },
    assertResourceInScope: async (input) => {
      if (input.resourceId && opts?.resourceScopeThrows) throw new Error("resource out of scope");
    }
  };
  const registry = alertProviderRegistryFactory();
  registry.register(provider);

  const channelStore = new Map<string, TChannelRow>();
  (opts?.channels ?? []).forEach((c) => channelStore.set(c.id, c));

  const alerts = new Map<string, Record<string, unknown>>();
  const memberships = new Map<string, string[]>(); // alertId -> channelIds
  const findFilters: Array<Record<string, unknown>> = [];

  const inScope = (c: TChannelRow, scope: { orgId: string; projectId?: string | null }) =>
    c.orgId === scope.orgId && (c.projectId ?? null) === (scope.projectId ?? null);

  const service = alertServiceFactory({
    alertDAL: {
      transaction: async (cb: (tx: unknown) => unknown) => cb({}),
      create: async (data: Record<string, unknown>) => {
        const row = {
          id: "alert-1",
          ...data,
          condition: data.condition ? (JSON.parse(data.condition as string) as unknown) : null,
          filters: data.filters ? (JSON.parse(data.filters as string) as unknown) : null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        alerts.set(row.id, row);
        return row;
      },
      findActiveById: async (id: string) => alerts.get(id),
      findActiveByScope: async (filter: Record<string, unknown>) => {
        findFilters.push(filter);
        return [...alerts.values()].filter((row) =>
          Object.entries(filter).every(([key, value]) => value === undefined || row[key] === value)
        );
      },
      updateById: async (id: string, data: Record<string, unknown>) => {
        // Mirror knex, which throws "Empty .update() call detected!" on an empty patch.
        if (Object.keys(data).length === 0) throw new Error("Empty .update() call detected!");
        alerts.set(id, { ...alerts.get(id), ...data });
        return alerts.get(id);
      },
      deleteById: async (id: string) => alerts.delete(id)
    },
    alertChannelDAL: {
      findByIdsInScope: async (ids: string[], scope: { orgId: string; projectId?: string | null }) =>
        ids.map((id) => channelStore.get(id)).filter((c): c is TChannelRow => Boolean(c) && inScope(c!, scope)),
      findByAlertId: async (alertId: string) =>
        (memberships.get(alertId) ?? []).map((id) => channelStore.get(id)).filter(Boolean),
      findByAlertIds: async (alertIds: string[]) =>
        alertIds.flatMap((alertId) =>
          (memberships.get(alertId) ?? [])
            .map((id) => channelStore.get(id))
            .filter(Boolean)
            .map((c) => ({ ...(c as TChannelRow), alertId }))
        )
    },
    alertChannelMembershipDAL: {
      insertMany: async (data: Array<{ alertId: string; channelId: string }>) => {
        data.forEach(({ alertId, channelId }) =>
          memberships.set(alertId, [...(memberships.get(alertId) ?? []), channelId])
        );
        return data;
      },
      deleteByAlertId: async (alertId: string) => {
        memberships.delete(alertId);
        return 0;
      }
    },
    alertProviderRegistry: registry
  } as unknown as TAlertServiceFactoryDep);

  return { service, permissionCalls, alerts, memberships, channelStore, findFilters };
};

const actor = {
  actor: "user" as never,
  actorId: "user-1",
  actorAuthMethod: null as never,
  actorOrgId: "org-1"
};

const orgChannels: TChannelRow[] = [
  channelRow({ id: "ch-email", channelType: AlertChannelType.EMAIL }),
  channelRow({ id: "ch-webhook", channelType: AlertChannelType.WEBHOOK })
];

const validCreate = {
  name: "test-alert",
  resourceType: RESOURCE_TYPE,
  eventType: "test.resource.expiration",
  condition: { alertBefore: "30d" },
  channelIds: ["ch-email", "ch-webhook"],
  ...actor
};

describe("alert service", () => {
  test("creates an alert, attaches channels, and checks Create permission", async () => {
    const { service, permissionCalls, memberships } = buildService({ channels: orgChannels });
    const alert = await service.createAlert(validCreate);

    expect(alert.id).toBe("alert-1");
    expect(alert.orgId).toBe("org-1");
    expect(alert.channels.map((c) => c.id).sort()).toEqual(["ch-email", "ch-webhook"]);
    expect(alert.channels.find((c) => c.id === "ch-email")?.directed).toBe(true);
    expect(alert.channels.find((c) => c.id === "ch-webhook")?.directed).toBe(false);
    expect(memberships.get("alert-1")?.sort()).toEqual(["ch-email", "ch-webhook"]);
    expect(permissionCalls[0].action).toBe("create");
  });

  test("rejects an unknown resource type", async () => {
    const { service } = buildService({ channels: orgChannels });
    await expect(service.createAlert({ ...validCreate, resourceType: "nope.unknown" })).rejects.toThrow();
  });

  test("runs the provider resource-scope check when resourceId is set", async () => {
    const { service } = buildService({ channels: orgChannels, resourceScopeThrows: true });
    await expect(service.createAlert({ ...validCreate, resourceId: "foreign-resource" })).rejects.toThrow(
      "resource out of scope"
    );
  });

  test("skips the resource-scope check for a filter-based alert (no resourceId)", async () => {
    const { service } = buildService({ channels: orgChannels, resourceScopeThrows: true });
    await expect(service.createAlert(validCreate)).resolves.toBeDefined();
  });

  test("rejects a condition that fails the provider schema", async () => {
    const { service } = buildService({ channels: orgChannels });
    await expect(service.createAlert({ ...validCreate, condition: { wrong: 1 } })).rejects.toThrow();
  });

  test("rejects a create with no condition when the provider requires one", async () => {
    const { service } = buildService({ channels: orgChannels });
    await expect(service.createAlert({ ...validCreate, condition: undefined })).rejects.toThrow(
      /Invalid alert condition/
    );
  });

  test("rejects an event type the provider does not support", async () => {
    const { service } = buildService({ channels: orgChannels });
    await expect(service.createAlert({ ...validCreate, eventType: "test.resource.renewal" })).rejects.toThrow();
  });

  test("propagates a permission denial from the provider", async () => {
    const { service } = buildService({
      channels: orgChannels,
      assertPermission: async () => {
        throw new Error("forbidden");
      }
    });
    await expect(service.createAlert(validCreate)).rejects.toThrow("forbidden");
  });

  test("rejects channel ids that are not in the alert's scope", async () => {
    // The channel exists but belongs to a different project, so it must not be attachable here.
    const foreign = channelRow({ id: "ch-foreign", channelType: AlertChannelType.WEBHOOK, projectId: "other" });
    const { service } = buildService({ channels: [...orgChannels, foreign] });
    await expect(service.createAlert({ ...validCreate, channelIds: ["ch-foreign"] })).rejects.toThrow(
      /not found in this scope/
    );
  });

  test("rejects an empty channel list", async () => {
    const { service } = buildService({ channels: orgChannels });
    await expect(service.createAlert({ ...validCreate, channelIds: [] })).rejects.toThrow(
      "At least one channel is required"
    );
  });

  const listBase = {
    resourceType: RESOURCE_TYPE,
    resourceId: null,
    eventType: "test.resource.expiration",
    condition: null,
    filters: null,
    enabled: true,
    orgId: "org-1",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  test("org-scoped list returns only org-level alerts, never other projects'", async () => {
    const { service, alerts, findFilters } = buildService({ channels: orgChannels });
    alerts.set("org-alert", { id: "org-alert", name: "org", projectId: null, ...listBase });
    alerts.set("proj-alert", { id: "proj-alert", name: "proj", projectId: "proj-x", ...listBase });

    const result = await service.listAlerts({ resourceType: RESOURCE_TYPE, ...actor });

    expect(result.map((a) => a.id)).toEqual(["org-alert"]);
    expect(findFilters[0]).toMatchObject({ projectId: null });
  });

  test("project-scoped list filters to the requested project", async () => {
    const { service, alerts, findFilters } = buildService({ channels: orgChannels });
    alerts.set("org-alert", { id: "org-alert", name: "org", projectId: null, ...listBase });
    alerts.set("proj-alert", { id: "proj-alert", name: "proj", projectId: "proj-x", ...listBase });

    const result = await service.listAlerts({ resourceType: RESOURCE_TYPE, projectId: "proj-x", ...actor });

    expect(result.map((a) => a.id)).toEqual(["proj-alert"]);
    expect(findFilters[0]).toMatchObject({ projectId: "proj-x" });
  });

  test("update replaces the alert's attached channels", async () => {
    const { service, memberships } = buildService({ channels: orgChannels });
    await service.createAlert(validCreate);
    expect(memberships.get("alert-1")?.sort()).toEqual(["ch-email", "ch-webhook"]);

    const updated = await service.updateAlert({ alertId: "alert-1", channelIds: ["ch-webhook"], ...actor });

    expect(updated.channels.map((c) => c.id)).toEqual(["ch-webhook"]);
    expect(memberships.get("alert-1")).toEqual(["ch-webhook"]);
  });

  test("update rejects a channel id outside the alert's scope", async () => {
    const foreign = channelRow({ id: "ch-foreign", channelType: AlertChannelType.WEBHOOK, projectId: "other" });
    const { service } = buildService({ channels: [...orgChannels, foreign] });
    await service.createAlert(validCreate);
    await expect(service.updateAlert({ alertId: "alert-1", channelIds: ["ch-foreign"], ...actor })).rejects.toThrow(
      /not found in this scope/
    );
  });

  test("deletes an alert after checking Delete permission", async () => {
    const { service, permissionCalls } = buildService({ channels: orgChannels });
    await service.createAlert(validCreate);
    const result = await service.deleteAlert({ alertId: "alert-1", ...actor });
    expect(result.id).toBe("alert-1");
    expect(permissionCalls.some((c) => c.action === "delete")).toBe(true);
  });
});
