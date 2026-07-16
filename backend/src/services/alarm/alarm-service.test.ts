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
      find: async () => [...alarms.values()],
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
      deleteByAlarmId: async (alarmId: string) => {
        recipients.delete(alarmId);
        return 0;
      }
    },
    alarmHistoryDAL: { findLatestByAlarmId: async () => undefined },
    alarmProviderRegistry: registry,
    kmsService: kmsServiceMock
  } as unknown as TAlarmServiceFactoryDep);

  return { service, permissionCalls, alarms, channels };
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

  test("deletes an alarm after checking Delete permission", async () => {
    const { service, permissionCalls } = buildService();
    await service.createAlarm(validCreate);
    const result = await service.deleteAlarm({ alarmId: "alarm-1", ...actor });
    expect(result.id).toBe("alarm-1");
    expect(permissionCalls.some((c) => c.action === "delete")).toBe(true);
  });
});
