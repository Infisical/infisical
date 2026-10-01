import { z } from "zod";

import { DatabaseErrorCode } from "@app/lib/error-codes";
import { DatabaseError } from "@app/lib/errors";

import { TAlertChannelInput } from "./alert-channel-service-types";
import { AlertChannelType, TAlertPayload } from "./alert-channel-types";
import { alertProviderRegistryFactory } from "./alert-provider-registry";
import { alertServiceFactory, TAlertServiceFactoryDep } from "./alert-service";
import { AlertPrincipalType, AlertTriggerType, IResourceAlertProvider, TAlertPermissionInput } from "./alert-types";

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
}) => {
  const permissionCalls: TAlertPermissionInput[] = [];
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
    findDueTargets: async () => [],
    findTargetsByIds: async () => [],
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

  const alerts = new Map<string, Record<string, unknown>>();
  const channels = new Map<string, TChannelRow>(); // channelId -> row
  const memberships = new Map<string, string[]>(); // alertId -> channelIds
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
    alertChannelService: {
      createChannelInTx: async (input: {
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
      updateChannelInTx: async (input: {
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
      deleteChannelInTx: async (channelId: string) => {
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
    alerts,
    memberships
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
