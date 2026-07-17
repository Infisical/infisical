import { z } from "zod";

import { AlarmChannelType, TAlarmPayload } from "./alarm-channel-types";
import { alarmProviderRegistryFactory } from "./alarm-provider-registry";
import { alarmServiceFactory, TAlarmServiceFactoryDep } from "./alarm-service";
import { AlarmPrincipalType, IResourceAlarmProvider, TAlarmPermissionInput } from "./alarm-types";

const RESOURCE_TYPE = "test.resource";

// Identity cipher: encryptedConfig is just JSON bytes of the config.
const kmsServiceMock = {
  createCipherPairWithDataKey: async () => ({
    encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText }),
    decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
  })
};
const encConfig = (config: unknown) => Buffer.from(JSON.stringify(config));

const buildService = (opts?: {
  assertPermission?: (input: TAlarmPermissionInput) => Promise<void>;
  resourceScopeThrows?: boolean;
  rejectRecipients?: boolean;
}) => {
  const permissionCalls: TAlarmPermissionInput[] = [];
  const provider: IResourceAlarmProvider = {
    resourceType: RESOURCE_TYPE,
    eventTypes: ["test.resource.expiration"],
    conditionSchema: z.object({ alertBefore: z.string() }),
    findDueTargets: async () => [],
    buildPayload: () => ({}) as TAlarmPayload,
    targetId: () => "t",
    assertPermission: async (input) => {
      permissionCalls.push(input);
      if (opts?.assertPermission) await opts.assertPermission(input);
    },
    assertResourceInScope: async (input) => {
      // Mirror the real contract: no-op when there is no resource to bind-check.
      if (input.resourceId && opts?.resourceScopeThrows) throw new Error("resource out of scope");
    }
  };
  const registry = alarmProviderRegistryFactory();
  registry.register(provider);

  const alarms = new Map<string, Record<string, unknown>>();
  const channels = new Map<string, Array<Record<string, unknown>>>();
  const recipients = new Map<string, Array<Record<string, unknown>>>();
  const findFilters: Array<Record<string, unknown>> = [];

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
          Object.entries(filter).every(([key, value]) => {
            if (value === undefined) return true;
            return row[key] === value;
          })
        );
      },
      updateById: async (id: string, data: Record<string, unknown>) => {
        alarms.set(id, { ...alarms.get(id), ...data });
        return alarms.get(id);
      },
      deleteById: async (id: string) => alarms.delete(id)
    },
    alarmChannelDAL: {
      insertMany: async (data: Array<Record<string, unknown>>) => {
        const withMeta = data.map((c, i) => ({ id: `c${i}`, createdAt: new Date(), updatedAt: new Date(), ...c }));
        channels.set(data[0].alarmId as string, [...(channels.get(data[0].alarmId as string) ?? []), ...withMeta]);
        return withMeta;
      },
      findByAlarmId: async (alarmId: string) => channels.get(alarmId) ?? [],
      findByAlarmIds: async (alarmIds: string[]) => alarmIds.flatMap((alarmId) => channels.get(alarmId) ?? []),
      deleteByAlarmId: async (alarmId: string) => {
        channels.delete(alarmId);
        return 0;
      }
    },
    alarmRecipientDAL: {
      insertMany: async (data: Array<Record<string, unknown>>) => {
        recipients.set(data[0].alarmId as string, data);
        return data;
      },
      findByAlarmId: async (alarmId: string) => recipients.get(alarmId) ?? [],
      findByAlarmIds: async (alarmIds: string[]) => alarmIds.flatMap((alarmId) => recipients.get(alarmId) ?? []),
      deleteByAlarmId: async (alarmId: string) => {
        recipients.delete(alarmId);
        return 0;
      }
    },
    alarmProviderRegistry: registry,
    kmsService: kmsServiceMock,
    orgDAL: {
      findMembership: async (filter: { $in?: { actorUserId?: string[] } }) =>
        opts?.rejectRecipients ? [] : (filter.$in?.actorUserId ?? []).map((actorUserId) => ({ actorUserId }))
    },
    projectDAL: {
      findEffectiveProjectSubjectsMembership: async ({
        userIds,
        groupIds
      }: {
        userIds: string[];
        groupIds: string[];
      }) =>
        opts?.rejectRecipients
          ? { effectiveUserIds: [], effectiveGroupIds: [] }
          : { effectiveUserIds: userIds, effectiveGroupIds: groupIds }
    },
    groupDAL: {
      find: async (filter: { $in?: { id?: string[] } }) =>
        opts?.rejectRecipients ? [] : (filter.$in?.id ?? []).map((id) => ({ id }))
    }
  } as unknown as TAlarmServiceFactoryDep);

  return { service, permissionCalls, alarms, channels, recipients, findFilters };
};

const actor = {
  actor: "user" as never,
  actorId: "user-1",
  actorAuthMethod: null as never,
  actorOrgId: "org-1"
};

const validCreate = {
  name: "test-alarm",
  resourceType: RESOURCE_TYPE,
  eventType: "test.resource.expiration",
  condition: { alertBefore: "30d" },
  recipients: [{ principalType: AlarmPrincipalType.USER, principalId: "user-1" }],
  channels: [
    { channelType: AlarmChannelType.EMAIL, config: {} },
    { channelType: AlarmChannelType.WEBHOOK, config: { url: "https://example.com/hook" } }
  ],
  ...actor
};

describe("alarm service", () => {
  test("creates an alarm, persists channels + recipients, and checks Create permission", async () => {
    const { service, permissionCalls } = buildService();
    const alarm = await service.createAlarm(validCreate);

    expect(alarm.id).toBe("alarm-1");
    expect(alarm.orgId).toBe("org-1");
    expect(alarm.channels).toHaveLength(2);
    expect(alarm.recipients).toEqual([{ principalType: "user", principalId: "user-1" }]);
    expect(permissionCalls[0].action).toBe("create");
    expect(permissionCalls[0].orgId).toBe("org-1");
  });

  test("rejects an unknown resource type", async () => {
    const { service } = buildService();
    await expect(service.createAlarm({ ...validCreate, resourceType: "nope.unknown" })).rejects.toThrow();
  });

  test("runs the provider resource-scope check when resourceId is set", async () => {
    const { service } = buildService({ resourceScopeThrows: true });
    await expect(service.createAlarm({ ...validCreate, resourceId: "foreign-resource" })).rejects.toThrow(
      "resource out of scope"
    );
  });

  test("skips the resource-scope check for a filter-based alarm (no resourceId)", async () => {
    const { service } = buildService({ resourceScopeThrows: true });
    // No resourceId, so the scope check must not run and creation succeeds.
    await expect(service.createAlarm(validCreate)).resolves.toBeDefined();
  });

  test("rejects a condition that fails the provider schema", async () => {
    const { service } = buildService();
    await expect(service.createAlarm({ ...validCreate, condition: { wrong: 1 } })).rejects.toThrow();
  });

  test("rejects a create with no condition when the provider requires one", async () => {
    const { service } = buildService();
    // Omitted condition must be caught at create time (400), not stored as null and thrown at cron time.
    await expect(service.createAlarm({ ...validCreate, condition: undefined })).rejects.toThrow(
      /Invalid alarm condition/
    );
  });

  test("rejects an event type the provider does not support", async () => {
    const { service } = buildService();
    await expect(service.createAlarm({ ...validCreate, eventType: "test.resource.renewal" })).rejects.toThrow();
  });

  test("propagates a permission denial from the provider", async () => {
    const { service } = buildService({
      assertPermission: async () => {
        throw new Error("forbidden");
      }
    });
    await expect(service.createAlarm(validCreate)).rejects.toThrow("forbidden");
  });

  test("rejects recipients that do not belong to the scope", async () => {
    const { service } = buildService({ rejectRecipients: true });
    await expect(service.createAlarm(validCreate)).rejects.toThrow(/not members of the organization/);
  });

  test("accepts EMAIL recipients without a membership check", async () => {
    // rejectRecipients makes every user/group lookup come back empty; an email-only alarm must
    // still succeed because raw addresses are not validated against the org/project.
    const { service } = buildService({ rejectRecipients: true });
    const alarm = await service.createAlarm({
      ...validCreate,
      recipients: [{ principalType: AlarmPrincipalType.EMAIL, principalId: "ops@example.com" }]
    });
    expect(alarm.recipients).toEqual([{ principalType: "email", principalId: "ops@example.com" }]);
  });

  test("redacts the webhook signing secret on read", async () => {
    const { service, alarms, channels } = buildService();
    alarms.set("alarm-1", {
      id: "alarm-1",
      name: "wh",
      resourceType: RESOURCE_TYPE,
      resourceId: null,
      eventType: "test.resource.expiration",
      condition: null,
      filters: null,
      enabled: true,
      orgId: "org-1",
      projectId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    channels.set("alarm-1", [
      {
        id: "c0",
        channelType: AlarmChannelType.WEBHOOK,
        encryptedConfig: encConfig({ url: "https://example.com/hook", signingSecret: "s3cr3t" }),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);

    const alarm = await service.getAlarmById({ alarmId: "alarm-1", ...actor });
    expect(alarm.channels[0].config).toEqual({ url: "https://example.com/hook", hasSigningSecret: true });
    expect(alarm.channels[0].config).not.toHaveProperty("signingSecret");
  });

  test("redacts the Slack webhook URL and PagerDuty integration key on read", async () => {
    const { service, alarms, channels } = buildService();
    alarms.set("alarm-1", {
      id: "alarm-1",
      name: "creds",
      resourceType: RESOURCE_TYPE,
      resourceId: null,
      eventType: "test.resource.expiration",
      condition: null,
      filters: null,
      enabled: true,
      orgId: "org-1",
      projectId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    channels.set("alarm-1", [
      {
        id: "c0",
        channelType: AlarmChannelType.SLACK,
        encryptedConfig: encConfig({ webhookUrl: "https://hooks.slack.com/services/T/B/xxx" }),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "c1",
        channelType: AlarmChannelType.PAGERDUTY,
        encryptedConfig: encConfig({ integrationKey: "a".repeat(32) }),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);

    const alarm = await service.getAlarmById({ alarmId: "alarm-1", ...actor });

    expect(alarm.channels[0].config).toEqual({ hasWebhookUrl: true });
    expect(alarm.channels[0].config).not.toHaveProperty("webhookUrl");
    expect(alarm.channels[1].config).toEqual({ hasIntegrationKey: true });
    expect(alarm.channels[1].config).not.toHaveProperty("integrationKey");
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
    const { service, alarms, findFilters } = buildService();
    alarms.set("org-alarm", { id: "org-alarm", name: "org", projectId: null, ...listBase });
    alarms.set("proj-alarm", { id: "proj-alarm", name: "proj", projectId: "proj-x", ...listBase });

    const result = await service.listAlarms({ resourceType: RESOURCE_TYPE, ...actor });

    expect(result.map((a) => a.id)).toEqual(["org-alarm"]);
    expect(findFilters[0]).toMatchObject({ projectId: null });
  });

  test("project-scoped list filters to the requested project", async () => {
    const { service, alarms, findFilters } = buildService();
    alarms.set("org-alarm", { id: "org-alarm", name: "org", projectId: null, ...listBase });
    alarms.set("proj-alarm", { id: "proj-alarm", name: "proj", projectId: "proj-x", ...listBase });

    const result = await service.listAlarms({ resourceType: RESOURCE_TYPE, projectId: "proj-x", ...actor });

    expect(result.map((a) => a.id)).toEqual(["proj-alarm"]);
    expect(findFilters[0]).toMatchObject({ projectId: "proj-x" });
  });

  const seedAlarmWithChannel = (
    channelType: AlarmChannelType,
    config: unknown,
    channelId = "c0"
  ): ReturnType<typeof buildService> => {
    const built = buildService();
    built.alarms.set("alarm-1", {
      id: "alarm-1",
      name: "a",
      resourceType: RESOURCE_TYPE,
      resourceId: null,
      eventType: "test.resource.expiration",
      condition: null,
      filters: null,
      enabled: true,
      orgId: "org-1",
      projectId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    built.channels.set("alarm-1", [
      {
        id: channelId,
        channelType,
        encryptedConfig: encConfig(config),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    return built;
  };

  test("preserves an unresent webhook signing secret when a channel is edited by id", async () => {
    const { service } = seedAlarmWithChannel(AlarmChannelType.WEBHOOK, {
      url: "https://example.com/hook",
      signingSecret: "s3cr3t"
    });

    const updated = await service.updateAlarm({
      alarmId: "alarm-1",
      channels: [{ id: "c0", channelType: AlarmChannelType.WEBHOOK, config: { url: "https://example.com/hook" } }],
      ...actor
    });

    expect(updated.channels[0].config).toEqual({ url: "https://example.com/hook", hasSigningSecret: true });
  });

  test("preserves an unresent Slack webhook URL when a channel is edited by id", async () => {
    const { service } = seedAlarmWithChannel(AlarmChannelType.SLACK, {
      webhookUrl: "https://hooks.slack.com/services/T/B/xxx"
    });

    const updated = await service.updateAlarm({
      alarmId: "alarm-1",
      channels: [{ id: "c0", channelType: AlarmChannelType.SLACK, config: {} }],
      ...actor
    });

    expect(updated.channels[0].config).toEqual({ hasWebhookUrl: true });
  });

  test("does not fabricate a secret for a newly added channel (no id)", async () => {
    const { service } = seedAlarmWithChannel(AlarmChannelType.WEBHOOK, {
      url: "https://old.example.com/hook",
      signingSecret: "s3cr3t"
    });

    const updated = await service.updateAlarm({
      alarmId: "alarm-1",
      channels: [{ channelType: AlarmChannelType.WEBHOOK, config: { url: "https://new.example.com/hook" } }],
      ...actor
    });

    expect(updated.channels[0].config).toEqual({ url: "https://new.example.com/hook", hasSigningSecret: false });
  });

  test("allows a channel-only update of an email alarm using its existing recipients", async () => {
    const { service, recipients } = seedAlarmWithChannel(AlarmChannelType.EMAIL, {});
    recipients.set("alarm-1", [{ principalType: AlarmPrincipalType.USER, principalId: "user-1" }]);

    // No recipients in the update, but the alarm already has one; the directed-channel requirement
    // must be satisfied by the existing recipients rather than rejecting the edit.
    const updated = await service.updateAlarm({
      alarmId: "alarm-1",
      name: "renamed",
      channels: [{ id: "c0", channelType: AlarmChannelType.EMAIL, config: {} }],
      ...actor
    });

    expect(updated.name).toBe("renamed");
    expect(updated.recipients).toEqual([{ principalType: "user", principalId: "user-1" }]);
  });

  test("still rejects an email channel when the alarm has no recipients", async () => {
    const { service } = seedAlarmWithChannel(AlarmChannelType.EMAIL, {});

    await expect(
      service.updateAlarm({
        alarmId: "alarm-1",
        channels: [{ id: "c0", channelType: AlarmChannelType.EMAIL, config: {} }],
        ...actor
      })
    ).rejects.toThrow("At least one recipient is required");
  });

  test("deletes an alarm after checking Delete permission", async () => {
    const { service, permissionCalls } = buildService();
    await service.createAlarm(validCreate);
    const result = await service.deleteAlarm({ alarmId: "alarm-1", ...actor });
    expect(result.id).toBe("alarm-1");
    expect(permissionCalls.some((c) => c.action === "delete")).toBe(true);
  });
});
