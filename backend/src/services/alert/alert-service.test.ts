import { z } from "zod";

import { DatabaseErrorCode } from "@app/lib/error-codes";
import { DatabaseError } from "@app/lib/errors";

import { TAlertChannelInput } from "./alert-channel-service-types";
import { AlertChannelType, TAlertPayload } from "./alert-channel-types";
import { alertProviderRegistryFactory } from "./alert-provider-registry";
import { alertServiceFactory, TAlertServiceFactoryDep } from "./alert-service";
import {
  AlertAuditAction,
  AlertPrincipalType,
  AlertTriggerType,
  IResourceAlertProvider,
  TAlertPermissionInput
} from "./alert-types";

const RESOURCE_TYPE = "test.resource";

type TChannelRow = {
  id: string;
  name: string;
  channelType: AlertChannelType | string;
  enabled: boolean;
  orgId: string;
  projectId: string | null;
  recipients: { principalType: string; principalId: string }[];
  createdAt: Date;
  updatedAt: Date;
};

const buildService = (opts?: {
  assertPermission?: (input: TAlertPermissionInput) => Promise<void>;
  resourceScopeThrows?: boolean;
  duplicateExists?: boolean;
  createError?: Error;
  resolvedProjectId?: string;
  atOrgScope?: boolean;
}) => {
  const permissionCalls: TAlertPermissionInput[] = [];
  const gatedChannelTypeCalls: string[][] = [];
  const recipientProjectIds: (string | null)[] = [];
  const provider: IResourceAlertProvider = {
    resourceType: RESOURCE_TYPE,
    events: [
      {
        key: "test.resource.expiration",
        triggerType: AlertTriggerType.Scheduled,
        conditionSchema: z.object({ alertBefore: z.string() })
      },
      {
        key: "test.resource.opened",
        triggerType: AlertTriggerType.Event,
        conditionSchema: z.object({}).strict().nullish()
      }
    ],
    findScheduledTargets: async () => [],
    findEventTargets: async () => [],
    ...(opts?.atOrgScope ? { recipientPolicy: { atOrgScope: true } } : {}),
    buildViewUrl: async () => "https://app.infisical.com/x",
    buildPayload: () => ({}) as TAlertPayload,
    targetId: () => "t",
    assertPermission: async (input) => {
      permissionCalls.push(input);
      if (opts?.assertPermission) await opts.assertPermission(input);
    },
    assertResourceInScope: async (input) => {
      if (input.resourceId && opts?.resourceScopeThrows) throw new Error("resource out of scope");
    },
    assertChannelTypesAllowed: async ({ channelTypes }) => {
      gatedChannelTypeCalls.push(channelTypes);
    },
    ...(opts?.resolvedProjectId ? { resolveProjectId: async () => opts.resolvedProjectId as string } : {})
  };
  const registry = alertProviderRegistryFactory();
  registry.register(provider);

  const alerts = new Map<string, Record<string, unknown>>();
  const channels = new Map<string, TChannelRow>(); // channelId -> row
  const memberships = new Map<string, string[]>(); // alertId -> channelIds
  const findFilters: Array<Record<string, unknown>> = [];
  let channelSeq = 0;

  const matches = (row: Record<string, unknown>, filter: Record<string, unknown>) => {
    const { $in: inFilter, ...equality } = filter as { $in?: Record<string, unknown[]> };
    const inMatch = Object.entries(inFilter ?? {}).every(([key, values]) => values.includes(row[key]));
    return inMatch && Object.entries(equality).every(([key, value]) => value === undefined || row[key] === value);
  };

  const detach = (channelId: string) => {
    memberships.forEach((ids, alertId) =>
      memberships.set(
        alertId,
        ids.filter((id) => id !== channelId)
      )
    );
  };

  const service = alertServiceFactory({
    alertHistoryDAL: { findLatestByAlertIds: async () => [] },
    alertDAL: {
      transaction: async (cb: (tx: unknown) => unknown) => cb({}),
      create: async (data: Record<string, unknown>) => {
        if (opts?.createError) throw opts.createError;
        const row = {
          id: "alert-1",
          ...data,
          condition: data.condition ? (JSON.parse(data.condition as string) as unknown) : null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        alerts.set(row.id, row);
        return row;
      },
      findActiveById: async (id: string) => alerts.get(id),
      findWithChannelsForResources: async ({
        resourceType,
        resourceIds
      }: {
        resourceType: string;
        resourceIds: string[];
      }) =>
        [...alerts.values()]
          .filter((row) => row.resourceType === resourceType && resourceIds.includes(row.resourceId as string))
          .map((row) => ({
            id: row.id,
            name: row.name,
            resourceId: row.resourceId,
            channels: (memberships.get(row.id as string) ?? []).map((channelId) => {
              const channel = channels.get(channelId) as TChannelRow;
              return { id: channel.id, name: channel.name, channelType: channel.channelType, enabled: channel.enabled };
            })
          })),
      findActiveByScope: async (filter: Record<string, unknown>) => {
        findFilters.push(filter);
        return [...alerts.values()].filter((row) => matches(row, filter));
      },
      findScopedDuplicate: async () => (opts?.duplicateExists ? { id: "dup" } : undefined),
      updateById: async (id: string, data: Record<string, unknown>) => {
        // Mirror knex, which throws "Empty .update() call detected!" on an empty patch.
        if (Object.keys(data).length === 0) throw new Error("Empty .update() call detected!");
        alerts.set(id, { ...alerts.get(id), ...data });
        return alerts.get(id);
      },
      deleteById: async (id: string) => alerts.delete(id),
      find: async (filter: Record<string, unknown>) => [...alerts.values()].filter((row) => matches(row, filter)),
      delete: async (filter: Record<string, unknown>) => {
        const removed = [...alerts.values()].filter((row) => matches(row, filter));
        removed.forEach((row) => alerts.delete(row.id as string));
        return removed;
      }
    },
    alertChannelDAL: {
      findByAlertId: async (alertId: string) =>
        (memberships.get(alertId) ?? []).map((id) => channels.get(id)).filter(Boolean),
      findByAlertIds: async (alertIds: string[]) =>
        alertIds.flatMap((alertId) =>
          (memberships.get(alertId) ?? [])
            .map((id) => channels.get(id))
            .filter(Boolean)
            .map((c) => ({ ...(c as TChannelRow), alertId }))
        ),
      delete: async (filter: { $in?: { id?: string[] } }) => {
        const ids = filter.$in?.id ?? [];
        ids.forEach((id) => {
          channels.delete(id);
          detach(id);
        });
        return [];
      }
    },
    alertChannelMembershipDAL: {
      insertMany: async (data: Array<{ alertId: string; channelId: string }>) => {
        data.forEach(({ alertId, channelId }) =>
          memberships.set(alertId, [...(memberships.get(alertId) ?? []), channelId])
        );
        return data;
      }
    },
    // Prepared writes are the inputs passed straight through, so applying one is where a row appears.
    alertChannelService: {
      prepareChannelCreate: async (input: { recipientScope: { projectId: string | null } }) => {
        recipientProjectIds.push(input.recipientScope.projectId);
        return input;
      },
      prepareChannelUpdate: async (input: unknown) => input,
      applyChannelCreate: async (input: {
        name: string;
        channelType: AlertChannelType | string;
        enabled?: boolean;
        recipients?: { principalType: string; principalId: string }[];
        orgId: string;
        projectId?: string | null;
      }) => {
        channelSeq += 1;
        const row: TChannelRow = {
          id: `ch-${channelSeq}`,
          name: input.name,
          channelType: input.channelType,
          enabled: input.enabled ?? true,
          orgId: input.orgId,
          projectId: input.projectId ?? null,
          recipients: input.recipients ?? [],
          createdAt: new Date(),
          updatedAt: new Date()
        };
        channels.set(row.id, row);
        return row;
      },
      applyChannelUpdate: async (input: {
        channelId: string;
        name?: string;
        enabled?: boolean;
        recipients?: { principalType: string; principalId: string }[];
      }) => {
        const existing = channels.get(input.channelId) as TChannelRow;
        channels.set(input.channelId, {
          ...existing,
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          ...(input.recipients !== undefined ? { recipients: input.recipients } : {})
        });
        return {};
      },
      deleteChannel: async (channelId: string) => {
        channels.delete(channelId);
        detach(channelId);
      },
      getDetailsForChannels: async (chans: TChannelRow[]) =>
        chans.map((c) => ({
          id: c.id,
          name: c.name,
          channelType: c.channelType,
          enabled: c.enabled,
          config: {},
          recipients: c.recipients ?? []
        }))
    },
    kmsService: {
      createCipherPairWithDataKey: async () => ({
        encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText }),
        decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
      })
    },
    alertProviderRegistry: registry
  } as unknown as TAlertServiceFactoryDep);

  return {
    service,
    permissionCalls,
    gatedChannelTypeCalls,
    recipientProjectIds,
    alerts,
    memberships,
    channels,
    findFilters
  };
};

const actor = {
  actor: "user" as never,
  actorId: "user-1",
  actorAuthMethod: null as never,
  actorOrgId: "org-1"
};

const emailChannel: TAlertChannelInput = {
  name: "email-ch",
  channelType: AlertChannelType.EMAIL,
  recipients: [{ principalType: AlertPrincipalType.USER, principalId: "user-1" }]
};

const webhookChannel: TAlertChannelInput = {
  name: "webhook-ch",
  channelType: AlertChannelType.WEBHOOK,
  config: { url: "https://example.com/hook" }
};

const validCreate = {
  name: "test-alert",
  resourceType: RESOURCE_TYPE,
  resourceId: "resource-1",
  eventType: "test.resource.expiration",
  condition: { alertBefore: "30d" },
  channels: [emailChannel, webhookChannel],
  ...actor
};

describe("alert service", () => {
  test("creates an alert, inlines channels, and checks Create permission", async () => {
    const { service, permissionCalls, memberships } = buildService();
    const alert = await service.createAlert(validCreate);

    expect(alert.id).toBe("alert-1");
    expect(alert.orgId).toBe("org-1");
    expect(alert.channels).toHaveLength(2);
    expect(alert.channels.map((c) => c.channelType).sort()).toEqual(
      [AlertChannelType.EMAIL, AlertChannelType.WEBHOOK].sort()
    );
    expect(memberships.get("alert-1")).toHaveLength(2);
    expect(permissionCalls[0].action).toBe("create");
  });

  test("validates channel recipients at org scope when the provider asks for it", async () => {
    const projectScoped = buildService({ resolvedProjectId: "proj-resolved" });
    await projectScoped.service.createAlert({ ...validCreate, projectId: undefined });
    expect(projectScoped.recipientProjectIds).toEqual(["proj-resolved", "proj-resolved"]);

    const orgScoped = buildService({ resolvedProjectId: "proj-resolved", atOrgScope: true });
    await orgScoped.service.createAlert({ ...validCreate, projectId: undefined });
    expect(orgScoped.recipientProjectIds).toEqual([null, null]);
  });

  test("falls back to the generic alert audit events when the provider defines none", () => {
    const { service } = buildService();
    const alert = {
      id: "alert-1",
      name: "expiry",
      resourceType: RESOURCE_TYPE,
      resourceId: "resource-1",
      resourceName: "Resource One",
      eventType: "test.resource.expiration"
    };

    expect(service.getAuditEvent({ action: AlertAuditAction.Create, alert })).toEqual({
      type: "create-alert",
      metadata: {
        alertId: "alert-1",
        name: "expiry",
        resourceType: RESOURCE_TYPE,
        resourceId: "resource-1",
        eventType: "test.resource.expiration"
      }
    });
    expect(service.getAuditEvent({ action: AlertAuditAction.Delete, alert })).toEqual({
      type: "delete-alert",
      metadata: {
        alertId: "alert-1",
        name: "expiry",
        resourceType: RESOURCE_TYPE,
        eventType: "test.resource.expiration"
      }
    });
    expect(
      service.getAuditEvent({
        action: AlertAuditAction.TestChannel,
        test: { resourceType: RESOURCE_TYPE, resourceId: "resource-1", channelType: "slack", success: true }
      })
    ).toEqual({
      type: "test-alert-channel",
      metadata: {
        channelId: undefined,
        channelType: "slack",
        resourceType: RESOURCE_TYPE,
        resourceId: "resource-1",
        success: true,
        deliveredTo: undefined,
        error: undefined
      }
    });
  });

  test("rejects an unknown resource type", async () => {
    const { service } = buildService();
    await expect(service.createAlert({ ...validCreate, resourceType: "nope.unknown" })).rejects.toThrow();
  });

  test("rejects a duplicate alert in the same scope", async () => {
    const { service } = buildService({ duplicateExists: true });
    await expect(service.createAlert(validCreate)).rejects.toThrow(/already exists/);
  });

  test("runs the provider resource-scope check when resourceId is set", async () => {
    const { service } = buildService({ resourceScopeThrows: true });
    await expect(service.createAlert({ ...validCreate, resourceId: "foreign-resource" })).rejects.toThrow(
      "resource out of scope"
    );
  });

  // triggerType comes from the provider's event definition, never the request. That's what keeps
  // event-triggered alerts out of the daily scan.
  test("stores the trigger type its event declares", async () => {
    const { service, alerts } = buildService();

    await service.createAlert(validCreate);
    expect([...alerts.values()][0].triggerType).toBe("scheduled");

    const { service: eventService, alerts: eventAlerts } = buildService();
    await eventService.createAlert({ ...validCreate, eventType: "test.resource.opened", condition: null });
    expect([...eventAlerts.values()][0].triggerType).toBe("event");
  });

  test("returns the trigger type so a client can tell a scheduled alert from an event one", async () => {
    const { service } = buildService();

    const created = await service.createAlert(validCreate);

    expect(created.triggerType).toBe("scheduled");
  });

  test("rejects a resource-less (scope-wide) alert as unsupported", async () => {
    const { service } = buildService();
    await expect(service.createAlert({ ...validCreate, resourceId: undefined })).rejects.toThrow(/not supported yet/);
  });

  test("rejects a condition that fails the provider schema", async () => {
    const { service } = buildService();
    await expect(service.createAlert({ ...validCreate, condition: { wrong: 1 } })).rejects.toThrow();
  });

  test("rejects a create with no condition when the provider requires one", async () => {
    const { service } = buildService();
    await expect(service.createAlert({ ...validCreate, condition: undefined })).rejects.toThrow(
      /Invalid alert condition/
    );
  });

  test("validates the condition against the event's own schema, not a provider-wide one", async () => {
    const { service } = buildService();
    await expect(
      service.createAlert({ ...validCreate, eventType: "test.resource.opened", condition: { alertBefore: "30d" } })
    ).rejects.toThrow(/Invalid alert condition/);
    const created = await service.createAlert({
      ...validCreate,
      resourceId: "resource-2",
      eventType: "test.resource.opened",
      condition: null
    });
    expect(created.condition).toBeNull();
  });

  test("update validates the condition against the stored event's schema", async () => {
    const { service } = buildService();
    await service.createAlert(validCreate);
    await expect(service.updateAlert({ alertId: "alert-1", condition: { alertBefore: 5 }, ...actor })).rejects.toThrow(
      /Invalid alert condition/
    );
    await expect(
      service.updateAlert({ alertId: "alert-1", condition: { alertBefore: "5d" }, ...actor })
    ).resolves.toBeDefined();
  });

  test("rejects an event type the provider does not support", async () => {
    const { service } = buildService();
    await expect(service.createAlert({ ...validCreate, eventType: "test.resource.renewal" })).rejects.toThrow();
  });

  test("propagates a permission denial from the provider", async () => {
    const { service } = buildService({
      assertPermission: async () => {
        throw new Error("forbidden");
      }
    });
    await expect(service.createAlert(validCreate)).rejects.toThrow("forbidden");
  });

  test("rejects an empty channel list", async () => {
    const { service } = buildService();
    await expect(service.createAlert({ ...validCreate, channels: [] })).rejects.toThrow(
      "At least one channel is required"
    );
  });

  test("create and list resolve the project from the resource when projectId is omitted", async () => {
    const { service, permissionCalls, findFilters } = buildService({ resolvedProjectId: "proj-resolved" });

    const created = await service.createAlert(validCreate);
    expect(created.projectId).toBe("proj-resolved");

    await service.listAlerts({ resourceType: RESOURCE_TYPE, resourceId: "resource-1", ...actor });
    expect(findFilters.at(-1)).toMatchObject({ projectId: "proj-resolved" });
    expect(permissionCalls.every((call) => call.projectId === "proj-resolved")).toBe(true);
  });

  test("update gates every new channel, even when the alert already has one of that type", async () => {
    const { service, gatedChannelTypeCalls } = buildService();
    const created = await service.createAlert(validCreate);
    const existingWebhook = created.channels.find((c) => c.channelType === AlertChannelType.WEBHOOK)!;

    await service.updateAlert({
      alertId: "alert-1",
      channels: [
        { id: existingWebhook.id, name: existingWebhook.name, channelType: AlertChannelType.WEBHOOK },
        { name: "second-webhook", channelType: AlertChannelType.WEBHOOK, config: { url: "https://example.com/2" } }
      ],
      ...actor
    });

    expect(gatedChannelTypeCalls.at(-1)).toEqual([AlertChannelType.WEBHOOK]);
  });

  test("update does not gate channels the alert already has", async () => {
    const { service, gatedChannelTypeCalls } = buildService();
    const created = await service.createAlert(validCreate);

    await service.updateAlert({
      alertId: "alert-1",
      channels: created.channels.map((c) => ({
        id: c.id,
        name: c.name,
        channelType: c.channelType as AlertChannelType
      })),
      ...actor
    });

    expect(gatedChannelTypeCalls.at(-1)).toEqual([]);
  });

  test("refuses more channels than an alert can hold", async () => {
    const { service } = buildService();
    const channels = Array.from({ length: 11 }, (_, i) => ({
      name: `hook-${i}`,
      channelType: AlertChannelType.WEBHOOK,
      config: { url: `https://example.com/${i}` }
    }));
    await expect(service.createAlert({ ...validCreate, channels })).rejects.toThrow(
      "An alert can have at most 10 channels, and this would leave it with 11"
    );

    await service.createAlert(validCreate);
    await expect(service.updateAlert({ alertId: "alert-1", channels, ...actor })).rejects.toThrow(
      "An alert can have at most 10 channels, and this would leave it with 11"
    );
  });

  describe("an alert a service keeps on its own resource", () => {
    const resourceAlert = (recipientIds: string[]) => ({
      resourceType: RESOURCE_TYPE,
      resourceId: "resource-1",
      projectId: "proj-1",
      eventType: "test.resource.opened",
      name: "Resource alert",
      channels: {
        replaceRecipients: {
          channelType: AlertChannelType.EMAIL,
          recipients: recipientIds.map((principalId) => ({ principalType: AlertPrincipalType.USER, principalId }))
        }
      },
      ...actor
    });
    const tx = {} as never;

    test("is written only when applied", async () => {
      const { service, alerts, channels } = buildService();
      const prepared = await service.prepareAlertForResource(resourceAlert(["user-1"]));
      expect(alerts.size).toBe(0);
      expect(channels.size).toBe(0);

      await service.applyPreparedAlert(prepared, tx);
      expect(alerts.size).toBe(1);
      expect([...channels.values()].map((c) => c.name)).toEqual(["Email"]);
    });

    test("spreads recipients over as many email channels as they need", async () => {
      const { service, channels } = buildService();
      const recipientIds = Array.from({ length: 45 }, (_, i) => `user-${i}`);
      await service.applyPreparedAlert(await service.prepareAlertForResource(resourceAlert(recipientIds)), tx);

      expect([...channels.values()].map((c) => [c.name, c.recipients.length])).toEqual([
        ["Email", 20],
        ["Email 2", 20],
        ["Email 3", 5]
      ]);
    });

    test("updates the existing alert, reusing its email channel and keeping its other channels", async () => {
      const { service, alerts, channels } = buildService();
      await service.createAlert({ ...validCreate, eventType: "test.resource.opened", condition: null });
      const [emailBefore, webhookBefore] = [...channels.values()];

      await service.applyPreparedAlert(await service.prepareAlertForResource(resourceAlert(["user-2"])), tx);

      expect(alerts.size).toBe(1);
      expect([...channels.values()]).toEqual([
        expect.objectContaining({
          id: emailBefore.id,
          name: "email-ch",
          recipients: [expect.objectContaining({ principalId: "user-2" })]
        }),
        expect.objectContaining({ id: webhookBefore.id, name: "webhook-ch" })
      ]);
    });
  });

  test("update rejects an empty channel list", async () => {
    const { service } = buildService();
    await service.createAlert(validCreate);
    await expect(service.updateAlert({ alertId: "alert-1", channels: [], ...actor })).rejects.toThrow(
      "At least one channel is required"
    );
  });

  test("checks Delete permission before deleting an alert", async () => {
    const { service, permissionCalls } = buildService();
    await service.createAlert(validCreate);

    await service.deleteAlert({ alertId: "alert-1", ...actor });

    expect(permissionCalls.map((call) => call.action)).toContain("delete");
  });

  test("a concurrent duplicate create surfaces as a readable error, not a 500", async () => {
    const { service } = buildService({
      createError: new DatabaseError({ error: { code: DatabaseErrorCode.UniqueViolation }, name: "Create" })
    });
    await expect(service.createAlert(validCreate)).rejects.toThrow(
      "An alert for this resource and event already exists"
    );
  });
});
