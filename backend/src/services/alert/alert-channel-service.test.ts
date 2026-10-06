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
const CREATOR = { createdByActorId: "11111111-1111-1111-1111-111111111111", createdByActorType: "user" };
const RECIPIENT_SCOPE = { projectId: null, allowEmailAddresses: true };
const CHANNEL_INPUT = { ...CREATOR, recipientScope: RECIPIENT_SCOPE };

type TRow = {
  id: string;
  name: string;
  channelType: AlertChannelType;
  encryptedConfig: Buffer;
  enabled: boolean;
  orgId: string;
  projectId: string | null;
  createdByActorId: string | null;
  createdByActorType: string;
  createdAt: Date;
  updatedAt: Date;
};

const buildService = (opts?: { seed?: TRow[]; projectUserIds?: string[] }) => {
  const scopeCheckTxs: unknown[] = [];
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
          ...CREATOR,
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
        groupIds,
        tx: scopeTx
      }: {
        userIds: string[];
        groupIds: string[];
        tx?: unknown;
      }) => {
        scopeCheckTxs.push(scopeTx);
        return {
          effectiveUserIds: opts?.projectUserIds ? userIds.filter((id) => opts.projectUserIds!.includes(id)) : userIds,
          effectiveGroupIds: groupIds
        };
      }
    },
    groupDAL: { find: async (filter: { $in?: { id?: string[] } }) => (filter.$in?.id ?? []).map((id) => ({ id })) },
    emailDomainDAL: { find: async () => [{ domain: "verified-example.com" }] }
  } as unknown as TAlertChannelServiceFactoryDep);

  return { service, store, recipients, scopeCheckTxs };
};

type TService = ReturnType<typeof buildService>["service"];

// Prepares then applies in one transaction, the way the alert service writes a channel.
const createChannel = async (
  service: TService,
  input: Parameters<TService["prepareChannelCreate"]>[0],
  enc: Parameters<TService["prepareChannelCreate"]>[1],
  trx: Knex
) => service.applyChannelCreate(await service.prepareChannelCreate(input, enc, trx), trx);

const updateChannel = async (
  service: TService,
  input: Parameters<TService["prepareChannelUpdate"]>[0],
  channel: Parameters<TService["prepareChannelUpdate"]>[1],
  channelCipher: Parameters<TService["prepareChannelUpdate"]>[2],
  trx: Knex
) => service.applyChannelUpdate(await service.prepareChannelUpdate(input, channel, channelCipher, trx), trx);

const seedRow = (
  over: Partial<TRow> & { id: string; channelType: AlertChannelType; encryptedConfig: Buffer }
): TRow => ({
  name: over.id,
  enabled: true,
  orgId: "org-1",
  projectId: null,
  ...CHANNEL_INPUT,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over
});

describe("alert channel service", () => {
  test("creates a webhook channel, stores config, and redacts secrets in the detail view", async () => {
    const { service } = buildService();
    const channel = await createChannel(
      service,
      {
        name: "Ops webhook",
        channelType: AlertChannelType.WEBHOOK,
        config: { url: "https://example.com/hook", signingSecret: "s3cr3t" },
        orgId: "org-1",
        ...CHANNEL_INPUT
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
      createChannel(
        service,
        { name: "Team email", channelType: AlertChannelType.EMAIL, config: {}, orgId: "org-1", ...CHANNEL_INPUT },
        encryptor as never,
        tx
      )
    ).rejects.toThrow("require at least one recipient");

    await expect(
      createChannel(
        service,
        {
          name: "Ops webhook",
          channelType: AlertChannelType.WEBHOOK,
          config: { url: "https://example.com/hook" },
          recipients: [{ principalType: AlertPrincipalType.USER, principalId: "user-1" }],
          orgId: "org-1",
          ...CHANNEL_INPUT
        },
        encryptor as never,
        tx
      )
    ).rejects.toThrow("do not take recipients");
  });

  test("creates a directed email channel with recipients", async () => {
    const { service, recipients } = buildService();
    const channel = await createChannel(
      service,
      {
        name: "Team email",
        channelType: AlertChannelType.EMAIL,
        config: {},
        recipients: [{ principalType: AlertPrincipalType.USER, principalId: "user-1" }],
        orgId: "org-1",
        ...CHANNEL_INPUT
      },
      encryptor as never,
      tx
    );
    const [detail] = await service.getDetailsForChannels([channel], { decryptor: decryptor as never });
    expect(detail.channelType).toBe(AlertChannelType.EMAIL);
    expect(detail.recipients).toEqual([{ principalType: "user", principalId: "user-1" }]);
    expect(recipients.get(channel.id)).toHaveLength(1);
  });

  test("rejects duplicate recipients instead of dropping them", async () => {
    const { service } = buildService();
    await expect(
      createChannel(
        service,
        {
          name: "Team email",
          channelType: AlertChannelType.EMAIL,
          config: {},
          recipients: [
            { principalType: AlertPrincipalType.EMAIL, principalId: "Ops@Verified-Example.com" },
            { principalType: AlertPrincipalType.EMAIL, principalId: "ops@verified-example.com" }
          ],
          orgId: "org-1",
          ...CHANNEL_INPUT
        },
        encryptor as never,
        tx
      )
    ).rejects.toThrow("Duplicate recipients: ops@verified-example.com");
    await expect(
      service.validateRecipients("org-1", RECIPIENT_SCOPE, [
        { principalType: AlertPrincipalType.USER, principalId: "user-1" },
        { principalType: AlertPrincipalType.USER, principalId: "user-1" }
      ])
    ).rejects.toThrow("Duplicate recipients: user-1");
  });

  test("stores email recipients exactly as sent", async () => {
    const { service, recipients } = buildService();
    const channel = await createChannel(
      service,
      {
        name: "Team email",
        channelType: AlertChannelType.EMAIL,
        config: {},
        recipients: [{ principalType: AlertPrincipalType.EMAIL, principalId: "Ops@Verified-Example.com" }],
        orgId: "org-1",
        ...CHANNEL_INPUT
      },
      encryptor as never,
      tx
    );
    expect(recipients.get(channel.id)).toEqual([
      { channelId: channel.id, principalType: "email", principalId: "Ops@Verified-Example.com" }
    ]);
  });

  test("rejects email address recipients for alert types that don't accept them", async () => {
    const { service } = buildService();
    await expect(
      service.validateRecipients("org-1", { projectId: null, allowEmailAddresses: false }, [
        { principalType: AlertPrincipalType.EMAIL, principalId: "ops@verified-example.com" }
      ])
    ).rejects.toThrow("doesn't accept email address recipients");
  });

  test("rejects an email recipient on an unverified domain", async () => {
    const { service } = buildService();
    await expect(
      createChannel(
        service,
        {
          name: "Team email",
          channelType: AlertChannelType.EMAIL,
          config: {},
          orgId: "org-1",
          ...CHANNEL_INPUT,
          recipients: [{ principalType: AlertPrincipalType.EMAIL, principalId: "outsider@unverified.io" }]
        },
        encryptor as never,
        tx
      )
    ).rejects.toThrow("Not on a verified domain: outsider@unverified.io");
  });

  test("validates standalone email recipients against the verified domains", async () => {
    const { service } = buildService();
    await expect(
      service.validateRecipients("org-1", RECIPIENT_SCOPE, [
        { principalType: AlertPrincipalType.EMAIL, principalId: "stranger@unverified.io" }
      ])
    ).rejects.toThrow("Not on a verified domain: stranger@unverified.io");
    await expect(
      service.validateRecipients("org-1", RECIPIENT_SCOPE, [
        { principalType: AlertPrincipalType.EMAIL, principalId: "ops@verified-example.com" }
      ])
    ).resolves.toBeUndefined();
  });

  test("keeps an omitted secret on update", async () => {
    const { service, store } = buildService({
      seed: [
        seedRow({
          id: "ch-1",
          channelType: AlertChannelType.WEBHOOK,
          encryptedConfig: encConfig({ url: "https://example.com/hook", signingSecret: "s3cr3t" })
        })
      ]
    });

    // Config sent without signingSecret -> keep the existing one.
    await updateChannel(
      service,
      { recipientScope: RECIPIENT_SCOPE, channelId: "ch-1", config: { url: "https://example.com/hook" } },
      store.get("ch-1") as never,
      cipher,
      tx
    );

    const stored = JSON.parse(store.get("ch-1")!.encryptedConfig.toString()) as Record<string, unknown>;
    expect(stored).toEqual({ url: "https://example.com/hook", signingSecret: "s3cr3t" });
  });

  test("rejects changing the channel type of an existing channel", async () => {
    const { service } = buildService();
    const channel = seedRow({
      id: "ch-1",
      channelType: AlertChannelType.WEBHOOK,
      encryptedConfig: encConfig({ url: "https://example.com/hook" })
    });

    await expect(
      updateChannel(
        service,
        { recipientScope: RECIPIENT_SCOPE, channelId: "ch-1", channelType: AlertChannelType.SLACK },
        channel as never,
        cipher,
        tx
      )
    ).rejects.toThrow("type cannot be changed");
  });

  test("clears an optional secret when explicitly emptied on update", async () => {
    const { service, store } = buildService();
    const channel = seedRow({
      id: "ch-1",
      channelType: AlertChannelType.WEBHOOK,
      encryptedConfig: encConfig({ url: "https://example.com/hook", signingSecret: "s3cr3t" })
    });

    await updateChannel(
      service,
      {
        recipientScope: RECIPIENT_SCOPE,
        channelId: "ch-1",
        config: { url: "https://example.com/hook", signingSecret: "" }
      },
      channel as never,
      cipher,
      tx
    );

    // It is actually gone from the stored ciphertext, not just hidden.
    const stored = JSON.parse(store.get("ch-1")!.encryptedConfig.toString()) as Record<string, unknown>;
    expect(stored).toEqual({ url: "https://example.com/hook" });
  });

  test("sets a new secret when a value is provided on update", async () => {
    const { service, store } = buildService();
    const channel = seedRow({
      id: "ch-1",
      channelType: AlertChannelType.WEBHOOK,
      encryptedConfig: encConfig({ url: "https://example.com/hook", signingSecret: "old" })
    });

    await updateChannel(
      service,
      {
        recipientScope: RECIPIENT_SCOPE,
        channelId: "ch-1",
        config: { url: "https://example.com/hook", signingSecret: "new" }
      },
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
      updateChannel(
        service,
        { recipientScope: RECIPIENT_SCOPE, channelId: "ch-1", config: { webhookUrl: "" } },
        channel as never,
        cipher,
        tx
      )
    ).rejects.toThrow(/Invalid slack channel config/);
  });

  test("accepts all project members on a channel in the same project", async () => {
    const { service, recipients } = buildService();
    const channel = await createChannel(
      service,
      {
        name: "Email",
        channelType: AlertChannelType.EMAIL,
        config: {},
        recipients: [{ principalType: AlertPrincipalType.PROJECT_MEMBERS, principalId: "proj-1" }],
        orgId: "org-1",
        projectId: "proj-1",
        recipientScope: { projectId: "proj-1", allowEmailAddresses: false },
        ...CREATOR
      },
      encryptor as never,
      tx
    );
    expect(recipients.get(channel.id)).toEqual([
      { channelId: channel.id, principalType: "project-members", principalId: "proj-1" }
    ]);
  });

  test("rejects all project members on an org-scoped channel", async () => {
    const { service } = buildService();
    await expect(
      createChannel(
        service,
        {
          name: "Email",
          channelType: AlertChannelType.EMAIL,
          config: {},
          recipients: [{ principalType: AlertPrincipalType.PROJECT_MEMBERS, principalId: "proj-1" }],
          orgId: "org-1",
          recipientScope: { projectId: null, allowEmailAddresses: false },
          ...CREATOR
        },
        encryptor as never,
        tx
      )
    ).rejects.toThrow("All project members can only be notified by a project alert");
  });

  test("rejects all project members that names another project", async () => {
    const { service } = buildService();
    await expect(
      createChannel(
        service,
        {
          name: "Email",
          channelType: AlertChannelType.EMAIL,
          config: {},
          recipients: [{ principalType: AlertPrincipalType.PROJECT_MEMBERS, principalId: "other-project" }],
          orgId: "org-1",
          projectId: "proj-1",
          recipientScope: { projectId: "proj-1", allowEmailAddresses: false },
          ...CREATOR
        },
        encryptor as never,
        tx
      )
    ).rejects.toThrow("All project members must refer to the alert's own project");
  });

  test("checks recipient scope inside the caller's transaction", async () => {
    const { service, scopeCheckTxs } = buildService();
    await createChannel(
      service,
      {
        name: "Email",
        channelType: AlertChannelType.EMAIL,
        config: {},
        recipients: [{ principalType: AlertPrincipalType.USER, principalId: "user-1" }],
        orgId: "org-1",
        projectId: "proj-1",
        recipientScope: { projectId: "proj-1", allowEmailAddresses: false },
        ...CREATOR
      },
      encryptor as never,
      tx
    );
    expect(scopeCheckTxs).toEqual([tx]);
  });

  test("accepts a platform creator with no actor id", async () => {
    const { service, store } = buildService();
    const channel = await createChannel(
      service,
      {
        name: "Email",
        channelType: AlertChannelType.EMAIL,
        config: {},
        recipients: [{ principalType: AlertPrincipalType.USER, principalId: "user-1" }],
        orgId: "org-1",
        recipientScope: { projectId: null, allowEmailAddresses: false },
        createdByActorId: null,
        createdByActorType: "platform"
      },
      encryptor as never,
      tx
    );
    expect(store.get(channel.id)).toMatchObject({ createdByActorId: null, createdByActorType: "platform" });
  });

  test("filterRecipientsInScope drops users who left the project and keeps the rest", async () => {
    const { service } = buildService({ projectUserIds: ["user-1"] });
    const kept = await service.filterRecipientsInScope(
      { orgId: "org-1", projectId: "proj-1" },
      [
        { principalType: AlertPrincipalType.USER, principalId: "user-1" },
        { principalType: AlertPrincipalType.USER, principalId: "user-gone" },
        { principalType: AlertPrincipalType.PROJECT_MEMBERS, principalId: "proj-1" },
        { principalType: AlertPrincipalType.PROJECT_MEMBERS, principalId: "other-project" }
      ],
      tx
    );
    expect(kept).toEqual([
      { principalType: "user", principalId: "user-1" },
      { principalType: "project-members", principalId: "proj-1" }
    ]);
  });
});
