import { z } from "zod";

import { alertChannelTestServiceFactory, TAlertChannelTestServiceFactoryDep } from "./alert-channel-test-service";
import { TAlertChannelSendContext, TAlertPayload, TChannelResult } from "./alert-channel-types";
import { alertProviderRegistryFactory } from "./alert-provider-registry";
import { IResourceAlertProvider, TAlertPermissionInput } from "./alert-types";
import { ALERT_CHANNEL_REGISTRY } from "./channels/alert-channel-registry";

// logger is `export let logger` assigned by initLogger(), which unit tests don't run, so the
// delivery-failure path (which logs) would otherwise dereference undefined. Mock it per-file.
vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

// The generic test payload reads SITE_URL, and initEnvConfig() doesn't run in unit tests.
vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com" })
}));

const RESOURCE_TYPE = "test.resource";
const ORG_ID = "org-1";
const ACTOR_ID = "actor-1";

const actor = {
  actor: "user",
  actorId: ACTOR_ID,
  actorAuthMethod: undefined,
  actorOrgId: ORG_ID
} as unknown as { actor: never; actorId: string; actorAuthMethod: never; actorOrgId: string };

const buildProvider = (opts?: { assertPermission?: (input: TAlertPermissionInput) => Promise<void> }) => {
  const provider: IResourceAlertProvider = {
    resourceType: RESOURCE_TYPE,
    eventTypes: ["test.resource.expiration"],
    conditionSchema: z.object({}).optional(),
    findDueTargets: async () => [],
    buildViewUrl: async () => "https://app.infisical.com/x",
    buildPayload: (alert, targets, viewUrl) =>
      ({
        alert: { id: alert.id, name: alert.name, orgId: alert.orgId, resourceType: alert.resourceType, viewUrl },
        eventKey: "test.resource.expiration",
        eventLabel: "Expiration",
        webhookType: "com.infisical.test.resource.expiration",
        resourceKind: "Test Resource",
        resourceOwnerKind: "Test Owner",
        severity: "critical",
        summary: "real summary",
        items: (targets as { id: string }[]).map((target) => ({ id: target.id, title: "sample" }))
      }) as TAlertPayload,
    targetId: () => "t",
    assertPermission: async (input) => {
      if (opts?.assertPermission) await opts.assertPermission(input);
    },
    assertResourceInScope: async () => {}
  };

  const registry = alertProviderRegistryFactory();
  registry.register(provider);
  return registry;
};

const buildKeyStore = () => {
  const keys = new Map<string, number>();
  return {
    acquired: [] as string[],
    setItemWithExpiryNX: async (key: string, expiryInSeconds: number | string, ...rest: string[]) => {
      void rest;
      if (keys.has(key)) return null;
      keys.set(key, Number(expiryInSeconds));
      return "OK" as const;
    },
    ttl: async (key: string) => keys.get(key) ?? -2
  };
};

const OWNING_ALERT = {
  id: "alert-1",
  orgId: ORG_ID,
  projectId: null,
  resourceType: RESOURCE_TYPE,
  resourceId: "resource-1"
};

const buildDeps = (overrides?: {
  registry?: ReturnType<typeof alertProviderRegistryFactory>;
  channel?: Record<string, unknown> | null;
  channelOwners?: Record<string, unknown>[];
  recipients?: { email: string }[];
  keyStore?: ReturnType<typeof buildKeyStore>;
}) => {
  const keyStore = overrides?.keyStore ?? buildKeyStore();
  return {
    keyStore,
    deps: {
      alertChannelDAL: {
        findById: async () => overrides?.channel ?? null
      },
      alertDAL: {
        findByChannelId: async () => overrides?.channelOwners ?? [OWNING_ALERT]
      },
      alertRecipientResolver: {
        resolveMany: async (rowsByChannel: Map<string, unknown[]>) =>
          new Map([...rowsByChannel.keys()].map((channelId) => [channelId, overrides?.recipients ?? []]))
      },
      alertProviderRegistry: overrides?.registry ?? buildProvider(),
      kmsService: {
        createCipherPairWithDataKey: async () => ({
          encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText }),
          decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
        })
      },
      smtpService: { sendMail: async () => {} },
      keyStore
    } as unknown as TAlertChannelTestServiceFactoryDep
  };
};

const stubSend = (channelType: "slack" | "email", impl: (ctx: TAlertChannelSendContext) => Promise<TChannelResult>) => {
  const definition = ALERT_CHANNEL_REGISTRY[channelType];
  const original = definition.send;
  definition.send = impl;
  return () => {
    definition.send = original;
  };
};

describe("alertChannelTestService", () => {
  test("sends a test through an undirected channel with the supplied config", async () => {
    const sent: TAlertChannelSendContext[] = [];
    const restore = stubSend("slack", async (ctx) => {
      sent.push(ctx);
      return { success: true };
    });

    try {
      const { deps } = buildDeps();
      const service = alertChannelTestServiceFactory(deps);

      const result = await service.testChannel({
        ...actor,
        resourceType: RESOURCE_TYPE,
        channelType: "slack" as never,
        config: { webhookUrl: "https://hooks.slack.com/services/T/B/x" }
      });

      expect(result).toEqual({ success: true, deliveredTo: 1 });
      expect(sent).toHaveLength(1);
      expect(sent[0].config).toEqual({ webhookUrl: "https://hooks.slack.com/services/T/B/x" });
      // A test must never page an on-call rotation at the severity a real firing would carry.
      expect(sent[0].payload.severity).toBe("info");
      expect(sent[0].payload.summary).toContain("test notification from Infisical");
      // The payload is generic mock data: it must not carry the provider's resource type, and it
      // must always carry at least one item (PagerDuty sends one event per item).
      expect(sent[0].payload.alert.resourceType).not.toBe(RESOURCE_TYPE);
      expect(sent[0].payload.items.length).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  test("falls back to the stored secret when the config omits it", async () => {
    const sent: TAlertChannelSendContext[] = [];
    const restore = stubSend("slack", async (ctx) => {
      sent.push(ctx);
      return { success: true };
    });

    try {
      const { deps } = buildDeps({
        channel: {
          id: "channel-1",
          orgId: ORG_ID,
          projectId: null,
          channelType: "slack",
          encryptedConfig: Buffer.from(JSON.stringify({ webhookUrl: "https://hooks.slack.com/services/T/B/stored" }))
        }
      });
      const service = alertChannelTestServiceFactory(deps);

      const result = await service.testChannel({
        ...actor,
        resourceType: RESOURCE_TYPE,
        channelId: "channel-1",
        channelType: "slack" as never,
        config: {}
      });

      expect(result.success).toBe(true);
      expect(sent[0].config).toEqual({ webhookUrl: "https://hooks.slack.com/services/T/B/stored" });
    } finally {
      restore();
    }
  });

  test("rejects a saved channel that belongs to another organization", async () => {
    const { deps } = buildDeps({
      channel: {
        id: "channel-1",
        orgId: "other-org",
        projectId: null,
        channelType: "slack",
        encryptedConfig: Buffer.from(JSON.stringify({ webhookUrl: "https://hooks.slack.com/services/T/B/stored" }))
      }
    });
    const service = alertChannelTestServiceFactory(deps);

    await expect(
      service.testChannel({
        ...actor,
        resourceType: RESOURCE_TYPE,
        channelId: "channel-1",
        channelType: "slack" as never,
        config: {}
      })
    ).rejects.toThrow(/not found in this scope/);
  });

  test("authorizes a saved channel against the alert that owns it, not the requested resource", async () => {
    const checked: { action: string; resourceId?: string | null }[] = [];
    const registry = buildProvider({
      assertPermission: async (input) => {
        checked.push({ action: input.action, resourceId: input.resourceId });
        // The caller can edit their own resource but not the one the channel's alert watches.
        if (input.resourceId === OWNING_ALERT.resourceId) throw new Error("forbidden");
      }
    });
    const { deps } = buildDeps({
      registry,
      channel: {
        id: "channel-1",
        orgId: ORG_ID,
        projectId: null,
        channelType: "slack",
        encryptedConfig: Buffer.from(JSON.stringify({ webhookUrl: "https://hooks.slack.com/services/T/B/stored" }))
      }
    });
    const service = alertChannelTestServiceFactory(deps);

    await expect(
      service.testChannel({
        ...actor,
        resourceType: RESOURCE_TYPE,
        resourceId: "resource-the-caller-owns",
        channelId: "channel-1",
        channelType: "slack" as never,
        config: {}
      })
    ).rejects.toThrow("forbidden");

    expect(checked).toContainEqual({ action: "edit", resourceId: OWNING_ALERT.resourceId });
  });

  test("rejects a saved channel that no alert owns", async () => {
    const { deps } = buildDeps({
      channelOwners: [],
      channel: {
        id: "channel-1",
        orgId: ORG_ID,
        projectId: null,
        channelType: "slack",
        encryptedConfig: Buffer.from(JSON.stringify({ webhookUrl: "https://hooks.slack.com/services/T/B/stored" }))
      }
    });
    const service = alertChannelTestServiceFactory(deps);

    await expect(
      service.testChannel({
        ...actor,
        resourceType: RESOURCE_TYPE,
        channelId: "channel-1",
        channelType: "slack" as never,
        config: {}
      })
    ).rejects.toThrow(/not found in this scope/);
  });

  test("rejects an invalid config before any cooldown is spent", async () => {
    const { deps, keyStore } = buildDeps();
    const service = alertChannelTestServiceFactory(deps);

    await expect(
      service.testChannel({
        ...actor,
        resourceType: RESOURCE_TYPE,
        channelType: "slack" as never,
        config: { webhookUrl: "https://example.com/not-slack" }
      })
    ).rejects.toThrow(/Invalid slack channel config/);

    // The window is still free, so a corrected config can be tested immediately.
    await expect(
      keyStore.setItemWithExpiryNX(`alert-channel-test-cooldown:${ORG_ID}:${ACTOR_ID}:slack`, 60, "1")
    ).resolves.toBe("OK");
  });

  test("holds a second test of the same channel type for the cooldown window", async () => {
    const restore = stubSend("slack", async () => ({ success: true }));

    try {
      const { deps } = buildDeps();
      const service = alertChannelTestServiceFactory(deps);
      const dto = {
        ...actor,
        resourceType: RESOURCE_TYPE,
        channelType: "slack" as never,
        config: { webhookUrl: "https://hooks.slack.com/services/T/B/x" }
      };

      await expect(service.testChannel(dto)).resolves.toEqual({ success: true, deliveredTo: 1 });
      await expect(service.testChannel(dto)).rejects.toThrow(/Try again in 60s/);
    } finally {
      restore();
    }
  });

  test("leaves other channel types testable while one is cooling down", async () => {
    const restoreSlack = stubSend("slack", async () => ({ success: true }));
    const restoreEmail = stubSend("email", async () => ({ success: true }));

    try {
      const { deps } = buildDeps({ recipients: [{ email: "a@example.com" }] });
      const service = alertChannelTestServiceFactory(deps);

      await service.testChannel({
        ...actor,
        resourceType: RESOURCE_TYPE,
        channelType: "slack" as never,
        config: { webhookUrl: "https://hooks.slack.com/services/T/B/x" }
      });

      await expect(
        service.testChannel({
          ...actor,
          resourceType: RESOURCE_TYPE,
          channelType: "email" as never,
          config: {},
          recipients: [{ principalType: "user" as never, principalId: "user-1" }]
        })
      ).resolves.toEqual({ success: true, deliveredTo: 1 });
    } finally {
      restoreSlack();
      restoreEmail();
    }
  });

  test("reports a delivery failure instead of throwing", async () => {
    const restore = stubSend("slack", async () => {
      throw new Error("connect ECONNREFUSED");
    });

    try {
      const { deps } = buildDeps();
      const service = alertChannelTestServiceFactory(deps);

      const result = await service.testChannel({
        ...actor,
        resourceType: RESOURCE_TYPE,
        channelType: "slack" as never,
        config: { webhookUrl: "https://hooks.slack.com/services/T/B/x" }
      });

      expect(result).toEqual({ success: false, error: "connect ECONNREFUSED" });
    } finally {
      restore();
    }
  });

  test("reports unresolvable recipients without spending the cooldown", async () => {
    const { deps, keyStore } = buildDeps({ recipients: [] });
    const service = alertChannelTestServiceFactory(deps);

    const result = await service.testChannel({
      ...actor,
      resourceType: RESOURCE_TYPE,
      channelType: "email" as never,
      config: {},
      recipients: [{ principalType: "user" as never, principalId: "outsider" }]
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/recipients could be resolved/);
    await expect(
      keyStore.setItemWithExpiryNX(`alert-channel-test-cooldown:${ORG_ID}:${ACTOR_ID}:email`, 60, "1")
    ).resolves.toBe("OK");
  });

  test("propagates the provider's permission decision", async () => {
    const registry = buildProvider({
      assertPermission: async () => {
        throw new Error("forbidden");
      }
    });
    const { deps } = buildDeps({ registry });
    const service = alertChannelTestServiceFactory(deps);

    await expect(
      service.testChannel({
        ...actor,
        resourceType: RESOURCE_TYPE,
        channelType: "slack" as never,
        config: { webhookUrl: "https://hooks.slack.com/services/T/B/x" }
      })
    ).rejects.toThrow("forbidden");
  });

  test("rejects a resource type with no registered provider", async () => {
    const { deps } = buildDeps();
    const service = alertChannelTestServiceFactory(deps);

    await expect(
      service.testChannel({
        ...actor,
        resourceType: "unknown.resource",
        channelType: "slack" as never,
        config: { webhookUrl: "https://hooks.slack.com/services/T/B/x" }
      })
    ).rejects.toThrow(/No alert provider is registered/);
  });
});
