import { createMongoAbility } from "@casl/ability";

import { alarmChannelServiceFactory, TAlarmChannelServiceFactoryDep } from "./alarm-channel-service";
import { AlarmChannelType } from "./alarm-channel-types";
import { AlarmPrincipalType } from "./alarm-types";

// Identity cipher: encryptedConfig is just JSON bytes of the config.
const kmsServiceMock = {
  createCipherPairWithDataKey: async () => ({
    encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText }),
    decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
  })
};
const encConfig = (config: unknown) => Buffer.from(JSON.stringify(config));

type TRow = {
  id: string;
  name: string;
  channelType: AlarmChannelType;
  encryptedConfig: Buffer;
  enabled: boolean;
  orgId: string;
  projectId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const actor = {
  actor: "user" as never,
  actorId: "user-1",
  actorAuthMethod: null as never,
  actorOrgId: "org-1"
};

const buildService = (opts?: { seed?: TRow[]; allow?: boolean }) => {
  const store = new Map<string, TRow>();
  (opts?.seed ?? []).forEach((r) => store.set(r.id, r));
  const recipients = new Map<string, Array<{ channelId: string; principalType: string; principalId: string }>>();
  const memberships = new Map<string, number>(); // channelId -> usage count
  let counter = 0;

  const ability = () =>
    createMongoAbility(
      opts?.allow === false ? [] : [{ action: ["read", "create", "edit", "delete"], subject: "settings" }]
    );

  const service = alarmChannelServiceFactory({
    alarmChannelDAL: {
      transaction: async (cb: (tx: unknown) => unknown) => cb({}),
      create: async (data: Record<string, unknown>) => {
        counter += 1;
        const row = {
          id: `ch-${counter}`,
          enabled: true,
          projectId: null,
          createdByUserId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        } as TRow;
        store.set(row.id, row);
        return row;
      },
      findById: async (id: string) => store.get(id),
      updateById: async (id: string, data: Record<string, unknown>) => {
        store.set(id, { ...(store.get(id) as TRow), ...data, updatedAt: new Date() });
        return store.get(id);
      },
      deleteById: async (id: string) => {
        store.delete(id);
        return { id };
      },
      findByNameInScope: async (name: string, scope: { orgId: string; projectId?: string | null }) =>
        [...store.values()].find(
          (r) => r.name === name && r.orgId === scope.orgId && (r.projectId ?? null) === (scope.projectId ?? null)
        ),
      findWithUsageByScope: async (scope: { orgId: string; projectId?: string | null }) =>
        [...store.values()]
          .filter((r) => r.orgId === scope.orgId && (r.projectId ?? null) === (scope.projectId ?? null))
          .map((r) => ({ ...r, usageCount: memberships.get(r.id) ?? 0 }))
    },
    alarmChannelRecipientDAL: {
      insertMany: async (data: Array<{ channelId: string; principalType: string; principalId: string }>) => {
        data.forEach((r) => recipients.set(r.channelId, [...(recipients.get(r.channelId) ?? []), r]));
        return data;
      },
      findByChannelId: async (channelId: string) => recipients.get(channelId) ?? [],
      findByChannelIds: async (ids: string[]) => ids.flatMap((id) => recipients.get(id) ?? []),
      deleteByChannelId: async (channelId: string) => {
        recipients.delete(channelId);
        return 0;
      }
    },
    alarmChannelMembershipDAL: {
      find: async ({ channelId }: { channelId: string }) =>
        Array.from({ length: memberships.get(channelId) ?? 0 }, (_, i) => ({ id: `m${i}` }))
    },
    kmsService: kmsServiceMock,
    permissionService: {
      getOrgPermission: async () => ({ permission: ability() }),
      getProjectPermission: async () => ({ permission: ability() })
    },
    orgDAL: {
      findMembership: async (filter: { $in?: { actorUserId?: string[] } }) =>
        (filter.$in?.actorUserId ?? []).map((actorUserId) => ({ actorUserId }))
    },
    projectDAL: {
      findEffectiveProjectSubjectsMembership: async ({
        userIds,
        groupIds
      }: {
        userIds: string[];
        groupIds: string[];
      }) => ({
        effectiveUserIds: userIds,
        effectiveGroupIds: groupIds
      })
    },
    groupDAL: { find: async (filter: { $in?: { id?: string[] } }) => (filter.$in?.id ?? []).map((id) => ({ id })) }
  } as unknown as TAlarmChannelServiceFactoryDep);

  return { service, store, recipients, memberships };
};

const seedRow = (
  over: Partial<TRow> & { id: string; channelType: AlarmChannelType; encryptedConfig: Buffer }
): TRow => ({
  name: over.id,
  enabled: true,
  orgId: "org-1",
  projectId: null,
  createdByUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over
});

describe("alarm channel service", () => {
  test("creates a webhook channel, stores config, and reports zero usage", async () => {
    const { service, store } = buildService();
    const channel = await service.createChannel({
      name: "Ops webhook",
      channelType: AlarmChannelType.WEBHOOK,
      config: { url: "https://example.com/hook", signingSecret: "s3cr3t" },
      ...actor
    });

    expect(channel.name).toBe("Ops webhook");
    expect(channel.usageCount).toBe(0);
    // Secret is redacted on the way out.
    expect(channel.config).toEqual({ url: "https://example.com/hook", hasSigningSecret: true });
    expect(store.get(channel.id)).toBeDefined();
  });

  test("requires recipients for a directed (email) channel and rejects them for others", async () => {
    const { service } = buildService();
    await expect(
      service.createChannel({ name: "Team email", channelType: AlarmChannelType.EMAIL, config: {}, ...actor })
    ).rejects.toThrow("require at least one recipient");

    await expect(
      service.createChannel({
        name: "Ops webhook",
        channelType: AlarmChannelType.WEBHOOK,
        config: { url: "https://example.com/hook" },
        recipients: [{ principalType: AlarmPrincipalType.USER, principalId: "user-1" }],
        ...actor
      })
    ).rejects.toThrow("do not take recipients");
  });

  test("creates a directed email channel with recipients", async () => {
    const { service, recipients } = buildService();
    const channel = await service.createChannel({
      name: "Team email",
      channelType: AlarmChannelType.EMAIL,
      config: {},
      recipients: [{ principalType: AlarmPrincipalType.USER, principalId: "user-1" }],
      ...actor
    });
    expect(channel.directed).toBe(true);
    expect(channel.recipients).toEqual([{ principalType: "user", principalId: "user-1" }]);
    expect(recipients.get(channel.id)).toHaveLength(1);
  });

  test("rejects a duplicate channel name in the same scope", async () => {
    const { service } = buildService({
      seed: [
        seedRow({
          id: "ch-x",
          name: "dupe",
          channelType: AlarmChannelType.WEBHOOK,
          encryptedConfig: encConfig({ url: "https://example.com" })
        })
      ]
    });
    await expect(
      service.createChannel({
        name: "dupe",
        channelType: AlarmChannelType.WEBHOOK,
        config: { url: "https://example.com/hook" },
        ...actor
      })
    ).rejects.toThrow(/already exists/);
  });

  test("keeps an omitted secret on update", async () => {
    const { service } = buildService({
      seed: [
        seedRow({
          id: "ch-1",
          channelType: AlarmChannelType.WEBHOOK,
          encryptedConfig: encConfig({ url: "https://example.com/hook", signingSecret: "s3cr3t" })
        })
      ]
    });

    // Config sent without signingSecret -> keep the existing one.
    const updated = await service.updateChannel({
      channelId: "ch-1",
      config: { url: "https://example.com/hook" },
      ...actor
    });
    expect(updated.config).toEqual({ url: "https://example.com/hook", hasSigningSecret: true });
  });

  test("clears an optional secret when explicitly emptied on update (fixes #2)", async () => {
    const { service, store } = buildService({
      seed: [
        seedRow({
          id: "ch-1",
          channelType: AlarmChannelType.WEBHOOK,
          encryptedConfig: encConfig({ url: "https://example.com/hook", signingSecret: "s3cr3t" })
        })
      ]
    });

    const updated = await service.updateChannel({
      channelId: "ch-1",
      config: { url: "https://example.com/hook", signingSecret: "" },
      ...actor
    });

    expect(updated.config).toEqual({ url: "https://example.com/hook", hasSigningSecret: false });
    // And it is actually gone from the stored ciphertext, not just hidden.
    const stored = JSON.parse(store.get("ch-1")!.encryptedConfig.toString()) as Record<string, unknown>;
    expect(stored).not.toHaveProperty("signingSecret");
  });

  test("sets a new secret when a value is provided on update", async () => {
    const { service, store } = buildService({
      seed: [
        seedRow({
          id: "ch-1",
          channelType: AlarmChannelType.WEBHOOK,
          encryptedConfig: encConfig({ url: "https://example.com/hook", signingSecret: "old" })
        })
      ]
    });

    await service.updateChannel({
      channelId: "ch-1",
      config: { url: "https://example.com/hook", signingSecret: "new" },
      ...actor
    });
    const stored = JSON.parse(store.get("ch-1")!.encryptedConfig.toString()) as Record<string, unknown>;
    expect(stored.signingSecret).toBe("new");
  });

  test("rejects clearing a required secret (Slack webhook URL)", async () => {
    const { service } = buildService({
      seed: [
        seedRow({
          id: "ch-1",
          channelType: AlarmChannelType.SLACK,
          encryptedConfig: encConfig({ webhookUrl: "https://hooks.slack.com/services/T/B/xxx" })
        })
      ]
    });

    await expect(service.updateChannel({ channelId: "ch-1", config: { webhookUrl: "" }, ...actor })).rejects.toThrow(
      /Invalid slack channel config/
    );
  });

  test("denies channel management without the settings permission", async () => {
    const { service } = buildService({ allow: false });
    await expect(
      service.createChannel({
        name: "nope",
        channelType: AlarmChannelType.WEBHOOK,
        config: { url: "https://example.com/hook" },
        ...actor
      })
    ).rejects.toThrow();
  });

  test("lists channels with their usage counts", async () => {
    const { service, memberships } = buildService({
      seed: [
        seedRow({
          id: "ch-1",
          name: "a",
          channelType: AlarmChannelType.WEBHOOK,
          encryptedConfig: encConfig({ url: "https://example.com/1" })
        }),
        seedRow({
          id: "ch-2",
          name: "b",
          channelType: AlarmChannelType.WEBHOOK,
          encryptedConfig: encConfig({ url: "https://example.com/2" })
        })
      ]
    });
    memberships.set("ch-1", 3);

    const channels = await service.listChannels({ ...actor });
    expect(channels.find((c) => c.id === "ch-1")?.usageCount).toBe(3);
    expect(channels.find((c) => c.id === "ch-2")?.usageCount).toBe(0);
  });
});
