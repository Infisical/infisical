import { Knex } from "knex";

import { alertChannelServiceFactory, TAlertChannelServiceFactoryDep } from "./alert-channel-service";
import { AlertChannelType } from "./alert-channel-types";
import { AlertPrincipalType } from "./alert-types";

// Identity cipher: encryptedConfig is just JSON bytes of the config.
const encryptor = ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText });
const decryptor = ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob;
const cipher = { encryptor, decryptor } as never;
const encConfig = (config: unknown) => Buffer.from(JSON.stringify(config));
const tx = {} as Knex;

type TRow = {
  id: string;
  name: string;
  channelType: AlertChannelType;
  encryptedConfig: Buffer;
  enabled: boolean;
  orgId: string;
  projectId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const buildService = (opts?: { seed?: TRow[] }) => {
  const store = new Map<string, TRow>();
  (opts?.seed ?? []).forEach((r) => store.set(r.id, r));
  const recipients = new Map<string, Array<{ channelId: string; principalType: string; principalId: string }>>();
  let counter = 0;

  const service = alertChannelServiceFactory({
    alertChannelDAL: {
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
      updateById: async (id: string, data: Record<string, unknown>) => {
        store.set(id, { ...(store.get(id) as TRow), ...data, updatedAt: new Date() });
        return store.get(id);
      },
      deleteById: async (id: string) => {
        store.delete(id);
        return { id };
      }
    },
    alertChannelRecipientDAL: {
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
  } as unknown as TAlertChannelServiceFactoryDep);

  return { service, store, recipients };
};

const seedRow = (
  over: Partial<TRow> & { id: string; channelType: AlertChannelType; encryptedConfig: Buffer }
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

describe("alert channel service", () => {
  test("creates a webhook channel, stores config, and redacts secrets in the detail view", async () => {
    const { service } = buildService();
    const channel = await service.createChannelInTx(
      {
        name: "Ops webhook",
        channelType: AlertChannelType.WEBHOOK,
        config: { url: "https://example.com/hook", signingSecret: "s3cr3t" },
        orgId: "org-1"
      },
      encryptor as never,
      tx
    );

    const [detail] = await service.getDetailsForChannels([channel], { decryptor: decryptor as never });
    expect(detail.name).toBe("Ops webhook");
    // Secret is redacted on the way out.
    expect(detail.config).toEqual({ url: "https://example.com/hook", hasSigningSecret: true });
    expect(detail.recipients).toEqual([]);
  });

  test("requires recipients for a directed (email) channel and rejects them for others", async () => {
    const { service } = buildService();
    await expect(
      service.createChannelInTx(
        { name: "Team email", channelType: AlertChannelType.EMAIL, config: {}, orgId: "org-1" },
        encryptor as never,
        tx
      )
    ).rejects.toThrow("require at least one recipient");

    await expect(
      service.createChannelInTx(
        {
          name: "Ops webhook",
          channelType: AlertChannelType.WEBHOOK,
          config: { url: "https://example.com/hook" },
          recipients: [{ principalType: AlertPrincipalType.USER, principalId: "user-1" }],
          orgId: "org-1"
        },
        encryptor as never,
        tx
      )
    ).rejects.toThrow("do not take recipients");
  });

  test("creates a directed email channel with recipients", async () => {
    const { service, recipients } = buildService();
    const channel = await service.createChannelInTx(
      {
        name: "Team email",
        channelType: AlertChannelType.EMAIL,
        config: {},
        recipients: [{ principalType: AlertPrincipalType.USER, principalId: "user-1" }],
        orgId: "org-1"
      },
      encryptor as never,
      tx
    );
    const [detail] = await service.getDetailsForChannels([channel], { decryptor: decryptor as never });
    expect(detail.directed).toBe(true);
    expect(detail.recipients).toEqual([{ principalType: "user", principalId: "user-1" }]);
    expect(recipients.get(channel.id)).toHaveLength(1);
  });

  test("keeps an omitted secret on update", async () => {
    const { service } = buildService();
    const channel = seedRow({
      id: "ch-1",
      channelType: AlertChannelType.WEBHOOK,
      encryptedConfig: encConfig({ url: "https://example.com/hook", signingSecret: "s3cr3t" })
    });

    // Config sent without signingSecret -> keep the existing one.
    const finalConfig = await service.updateChannelInTx(
      { channelId: "ch-1", config: { url: "https://example.com/hook" } },
      channel as never,
      cipher,
      tx
    );
    expect(finalConfig).toEqual({ url: "https://example.com/hook", signingSecret: "s3cr3t" });
  });

  test("clears an optional secret when explicitly emptied on update", async () => {
    const { service, store } = buildService();
    const channel = seedRow({
      id: "ch-1",
      channelType: AlertChannelType.WEBHOOK,
      encryptedConfig: encConfig({ url: "https://example.com/hook", signingSecret: "s3cr3t" })
    });

    const finalConfig = await service.updateChannelInTx(
      { channelId: "ch-1", config: { url: "https://example.com/hook", signingSecret: "" } },
      channel as never,
      cipher,
      tx
    );

    expect(finalConfig).toEqual({ url: "https://example.com/hook" });
    // And it is actually gone from the stored ciphertext, not just hidden.
    const stored = JSON.parse(store.get("ch-1")!.encryptedConfig.toString()) as Record<string, unknown>;
    expect(stored).not.toHaveProperty("signingSecret");
  });

  test("sets a new secret when a value is provided on update", async () => {
    const { service, store } = buildService();
    const channel = seedRow({
      id: "ch-1",
      channelType: AlertChannelType.WEBHOOK,
      encryptedConfig: encConfig({ url: "https://example.com/hook", signingSecret: "old" })
    });

    await service.updateChannelInTx(
      { channelId: "ch-1", config: { url: "https://example.com/hook", signingSecret: "new" } },
      channel as never,
      cipher,
      tx
    );
    const stored = JSON.parse(store.get("ch-1")!.encryptedConfig.toString()) as Record<string, unknown>;
    expect(stored.signingSecret).toBe("new");
  });

  test("rejects clearing a required secret (Slack webhook URL)", async () => {
    const { service } = buildService();
    const channel = seedRow({
      id: "ch-1",
      channelType: AlertChannelType.SLACK,
      encryptedConfig: encConfig({ webhookUrl: "https://hooks.slack.com/services/T/B/xxx" })
    });

    await expect(
      service.updateChannelInTx({ channelId: "ch-1", config: { webhookUrl: "" } }, channel as never, cipher, tx)
    ).rejects.toThrow(/Invalid slack channel config/);
  });
});
