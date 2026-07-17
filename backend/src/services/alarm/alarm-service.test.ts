import { z } from "zod";

import { AlarmChannelType, TAlarmPayload } from "./alarm-channel-types";
import { alarmProviderRegistryFactory } from "./alarm-provider-registry";
import { alarmServiceFactory, TAlarmServiceFactoryDep } from "./alarm-service";
import { IResourceAlarmProvider, TAlarmPermissionInput } from "./alarm-types";

const RESOURCE_TYPE = "test.resource";

type TChannelRow = {
  id: string;
  name: string;
  channelType: AlarmChannelType;
  enabled: boolean;
  orgId: string;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const channelRow = (over: Partial<TChannelRow> & { id: string; channelType: AlarmChannelType }): TChannelRow => ({
  name: over.id,
  enabled: true,
  orgId: "org-1",
  projectId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over
});

const buildService = (opts?: {
  assertPermission?: (input: TAlarmPermissionInput) => Promise<void>;
  resourceScopeThrows?: boolean;
  channels?: TChannelRow[];
}) => {
  const permissionCalls: TAlarmPermissionInput[] = [];
  const provider: IResourceAlarmProvider = {
    resourceType: RESOURCE_TYPE,
    eventTypes: ["test.resource.expiration"],
    conditionSchema: z.object({ alertBefore: z.string() }),
    findDueTargets: async () => [],
    buildViewUrl: async () => "https://app.infisical.com/x",
    buildPayload: () => ({}) as TAlarmPayload,
    targetId: () => "t",
    assertPermission: async (input) => {
      permissionCalls.push(input);
      if (opts?.assertPermission) await opts.assertPermission(input);
    },
    assertResourceInScope: async (input) => {
      if (input.resourceId && opts?.resourceScopeThrows) throw new Error("resource out of scope");
    }
  };
  const registry = alarmProviderRegistryFactory();
  registry.register(provider);

  const channelStore = new Map<string, TChannelRow>();
  (opts?.channels ?? []).forEach((c) => channelStore.set(c.id, c));

  const alarms = new Map<string, Record<string, unknown>>();
  const memberships = new Map<string, string[]>(); // alarmId -> channelIds
  const findFilters: Array<Record<string, unknown>> = [];

  const inScope = (c: TChannelRow, scope: { orgId: string; projectId?: string | null }) =>
    c.orgId === scope.orgId && (c.projectId ?? null) === (scope.projectId ?? null);

  const service = alarmServiceFactory({
    alarmDAL: {
      transaction: async (cb: (tx: unknown) => unknown) => cb({}),
      create: async (data: Record<string, unknown>) => {
        const row = {
          id: "alarm-1",
          ...data,
          condition: data.condition ? (JSON.parse(data.condition as string) as unknown) : null,
          filters: data.filters ? (JSON.parse(data.filters as string) as unknown) : null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        alarms.set(row.id, row);
        return row;
      },
      findById: async (id: string) => alarms.get(id),
      find: async (filter: Record<string, unknown>) => {
        findFilters.push(filter);
        return [...alarms.values()].filter((row) =>
          Object.entries(filter).every(([key, value]) => value === undefined || row[key] === value)
        );
      },
      updateById: async (id: string, data: Record<string, unknown>) => {
        alarms.set(id, { ...alarms.get(id), ...data });
        return alarms.get(id);
      },
      deleteById: async (id: string) => alarms.delete(id)
    },
    alarmChannelDAL: {
      findByIdsInScope: async (ids: string[], scope: { orgId: string; projectId?: string | null }) =>
        ids.map((id) => channelStore.get(id)).filter((c): c is TChannelRow => Boolean(c) && inScope(c!, scope)),
      findByAlarmId: async (alarmId: string) =>
        (memberships.get(alarmId) ?? []).map((id) => channelStore.get(id)).filter(Boolean),
      findByAlarmIds: async (alarmIds: string[]) =>
        alarmIds.flatMap((alarmId) =>
          (memberships.get(alarmId) ?? [])
            .map((id) => channelStore.get(id))
            .filter(Boolean)
            .map((c) => ({ ...(c as TChannelRow), alarmId }))
        )
    },
    alarmChannelMembershipDAL: {
      insertMany: async (data: Array<{ alarmId: string; channelId: string }>) => {
        data.forEach(({ alarmId, channelId }) =>
          memberships.set(alarmId, [...(memberships.get(alarmId) ?? []), channelId])
        );
        return data;
      },
      deleteByAlarmId: async (alarmId: string) => {
        memberships.delete(alarmId);
        return 0;
      }
    },
    alarmProviderRegistry: registry
  } as unknown as TAlarmServiceFactoryDep);

  return { service, permissionCalls, alarms, memberships, channelStore, findFilters };
};

const actor = {
  actor: "user" as never,
  actorId: "user-1",
  actorAuthMethod: null as never,
  actorOrgId: "org-1"
};

const orgChannels: TChannelRow[] = [
  channelRow({ id: "ch-email", channelType: AlarmChannelType.EMAIL }),
  channelRow({ id: "ch-webhook", channelType: AlarmChannelType.WEBHOOK })
];

const validCreate = {
  name: "test-alarm",
  resourceType: RESOURCE_TYPE,
  eventType: "test.resource.expiration",
  condition: { alertBefore: "30d" },
  channelIds: ["ch-email", "ch-webhook"],
  ...actor
};

describe("alarm service", () => {
  test("creates an alarm, attaches channels, and checks Create permission", async () => {
    const { service, permissionCalls, memberships } = buildService({ channels: orgChannels });
    const alarm = await service.createAlarm(validCreate);

    expect(alarm.id).toBe("alarm-1");
    expect(alarm.orgId).toBe("org-1");
    expect(alarm.channels.map((c) => c.id).sort()).toEqual(["ch-email", "ch-webhook"]);
    expect(alarm.channels.find((c) => c.id === "ch-email")?.directed).toBe(true);
    expect(alarm.channels.find((c) => c.id === "ch-webhook")?.directed).toBe(false);
    expect(memberships.get("alarm-1")?.sort()).toEqual(["ch-email", "ch-webhook"]);
    expect(permissionCalls[0].action).toBe("create");
  });

  test("rejects an unknown resource type", async () => {
    const { service } = buildService({ channels: orgChannels });
    await expect(service.createAlarm({ ...validCreate, resourceType: "nope.unknown" })).rejects.toThrow();
  });

  test("runs the provider resource-scope check when resourceId is set", async () => {
    const { service } = buildService({ channels: orgChannels, resourceScopeThrows: true });
    await expect(service.createAlarm({ ...validCreate, resourceId: "foreign-resource" })).rejects.toThrow(
      "resource out of scope"
    );
  });

  test("skips the resource-scope check for a filter-based alarm (no resourceId)", async () => {
    const { service } = buildService({ channels: orgChannels, resourceScopeThrows: true });
    await expect(service.createAlarm(validCreate)).resolves.toBeDefined();
  });

  test("rejects a condition that fails the provider schema", async () => {
    const { service } = buildService({ channels: orgChannels });
    await expect(service.createAlarm({ ...validCreate, condition: { wrong: 1 } })).rejects.toThrow();
  });

  test("rejects a create with no condition when the provider requires one", async () => {
    const { service } = buildService({ channels: orgChannels });
    await expect(service.createAlarm({ ...validCreate, condition: undefined })).rejects.toThrow(
      /Invalid alarm condition/
    );
  });

  test("rejects an event type the provider does not support", async () => {
    const { service } = buildService({ channels: orgChannels });
    await expect(service.createAlarm({ ...validCreate, eventType: "test.resource.renewal" })).rejects.toThrow();
  });

  test("propagates a permission denial from the provider", async () => {
    const { service } = buildService({
      channels: orgChannels,
      assertPermission: async () => {
        throw new Error("forbidden");
      }
    });
    await expect(service.createAlarm(validCreate)).rejects.toThrow("forbidden");
  });

  test("rejects channel ids that are not in the alarm's scope", async () => {
    // The channel exists but belongs to a different project, so it must not be attachable here.
    const foreign = channelRow({ id: "ch-foreign", channelType: AlarmChannelType.WEBHOOK, projectId: "other" });
    const { service } = buildService({ channels: [...orgChannels, foreign] });
    await expect(service.createAlarm({ ...validCreate, channelIds: ["ch-foreign"] })).rejects.toThrow(
      /not found in this scope/
    );
  });

  test("rejects an empty channel list", async () => {
    const { service } = buildService({ channels: orgChannels });
    await expect(service.createAlarm({ ...validCreate, channelIds: [] })).rejects.toThrow(
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

  test("org-scoped list returns only org-level alarms, never other projects'", async () => {
    const { service, alarms, findFilters } = buildService({ channels: orgChannels });
    alarms.set("org-alarm", { id: "org-alarm", name: "org", projectId: null, ...listBase });
    alarms.set("proj-alarm", { id: "proj-alarm", name: "proj", projectId: "proj-x", ...listBase });

    const result = await service.listAlarms({ resourceType: RESOURCE_TYPE, ...actor });

    expect(result.map((a) => a.id)).toEqual(["org-alarm"]);
    expect(findFilters[0]).toMatchObject({ projectId: null });
  });

  test("project-scoped list filters to the requested project", async () => {
    const { service, alarms, findFilters } = buildService({ channels: orgChannels });
    alarms.set("org-alarm", { id: "org-alarm", name: "org", projectId: null, ...listBase });
    alarms.set("proj-alarm", { id: "proj-alarm", name: "proj", projectId: "proj-x", ...listBase });

    const result = await service.listAlarms({ resourceType: RESOURCE_TYPE, projectId: "proj-x", ...actor });

    expect(result.map((a) => a.id)).toEqual(["proj-alarm"]);
    expect(findFilters[0]).toMatchObject({ projectId: "proj-x" });
  });

  test("update replaces the alarm's attached channels", async () => {
    const { service, memberships } = buildService({ channels: orgChannels });
    await service.createAlarm(validCreate);
    expect(memberships.get("alarm-1")?.sort()).toEqual(["ch-email", "ch-webhook"]);

    const updated = await service.updateAlarm({ alarmId: "alarm-1", channelIds: ["ch-webhook"], ...actor });

    expect(updated.channels.map((c) => c.id)).toEqual(["ch-webhook"]);
    expect(memberships.get("alarm-1")).toEqual(["ch-webhook"]);
  });

  test("update rejects a channel id outside the alarm's scope", async () => {
    const foreign = channelRow({ id: "ch-foreign", channelType: AlarmChannelType.WEBHOOK, projectId: "other" });
    const { service } = buildService({ channels: [...orgChannels, foreign] });
    await service.createAlarm(validCreate);
    await expect(service.updateAlarm({ alarmId: "alarm-1", channelIds: ["ch-foreign"], ...actor })).rejects.toThrow(
      /not found in this scope/
    );
  });

  test("deletes an alarm after checking Delete permission", async () => {
    const { service, permissionCalls } = buildService({ channels: orgChannels });
    await service.createAlarm(validCreate);
    const result = await service.deleteAlarm({ alarmId: "alarm-1", ...actor });
    expect(result.id).toBe("alarm-1");
    expect(permissionCalls.some((c) => c.action === "delete")).toBe(true);
  });
});
