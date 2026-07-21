import { z } from "zod";

import { TAlertChannelInput } from "./alert-channel-service-types";
import { AlertChannelType, TAlertPayload } from "./alert-channel-types";
import { alertProviderRegistryFactory } from "./alert-provider-registry";
import { alertServiceFactory, TAlertServiceFactoryDep } from "./alert-service";
import { AlertPrincipalType, IResourceAlertProvider, TAlertPermissionInput } from "./alert-types";

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

// Email is the only directed channel type; mirror the registry so response assembly reports `directed` correctly.
const isDirected = (channelType: AlertChannelType | string) => channelType === AlertChannelType.EMAIL;

const buildService = (opts?: {
  assertPermission?: (input: TAlertPermissionInput) => Promise<void>;
  resourceScopeThrows?: boolean;
  duplicateExists?: boolean;
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

  const alerts = new Map<string, Record<string, unknown>>();
  const channels = new Map<string, TChannelRow>(); // channelId -> row
  const memberships = new Map<string, string[]>(); // alertId -> channelIds
  const findFilters: Array<Record<string, unknown>> = [];
  let channelSeq = 0;

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
      findScopedDuplicate: async () => (opts?.duplicateExists ? { id: "dup" } : undefined),
      updateById: async (id: string, data: Record<string, unknown>) => {
        // Mirror knex, which throws "Empty .update() call detected!" on an empty patch.
        if (Object.keys(data).length === 0) throw new Error("Empty .update() call detected!");
        alerts.set(id, { ...alerts.get(id), ...data });
        return alerts.get(id);
      },
      deleteById: async (id: string) => alerts.delete(id)
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
        )
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
          directed: isDirected(c.channelType),
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

  return { service, permissionCalls, alerts, memberships, channels, findFilters };
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
    expect(alert.channels.find((c) => c.channelType === AlertChannelType.EMAIL)?.directed).toBe(true);
    expect(alert.channels.find((c) => c.channelType === AlertChannelType.WEBHOOK)?.directed).toBe(false);
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

  test("skips the resource-scope check for a filter-based alert (no resourceId)", async () => {
    const { service } = buildService({ resourceScopeThrows: true });
    await expect(service.createAlert(validCreate)).resolves.toBeDefined();
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
    const { service, alerts, findFilters } = buildService();
    alerts.set("org-alert", { id: "org-alert", name: "org", projectId: null, ...listBase });
    alerts.set("proj-alert", { id: "proj-alert", name: "proj", projectId: "proj-x", ...listBase });

    const result = await service.listAlerts({ resourceType: RESOURCE_TYPE, ...actor });

    expect(result.map((a) => a.id)).toEqual(["org-alert"]);
    expect(findFilters[0]).toMatchObject({ projectId: null });
  });

  test("project-scoped list filters to the requested project", async () => {
    const { service, alerts, findFilters } = buildService();
    alerts.set("org-alert", { id: "org-alert", name: "org", projectId: null, ...listBase });
    alerts.set("proj-alert", { id: "proj-alert", name: "proj", projectId: "proj-x", ...listBase });

    const result = await service.listAlerts({ resourceType: RESOURCE_TYPE, projectId: "proj-x", ...actor });

    expect(result.map((a) => a.id)).toEqual(["proj-alert"]);
    expect(findFilters[0]).toMatchObject({ projectId: "proj-x" });
  });

  test("update reconciles channels: keeps the referenced ones, deletes the rest, adds new", async () => {
    const { service, memberships } = buildService();
    const created = await service.createAlert(validCreate);
    expect(memberships.get("alert-1")).toHaveLength(2);

    const keep = created.channels.find((c) => c.channelType === AlertChannelType.WEBHOOK)!;
    const updated = await service.updateAlert({
      alertId: "alert-1",
      channels: [
        { id: keep.id, name: keep.name, channelType: AlertChannelType.WEBHOOK },
        { name: "new-slack", channelType: AlertChannelType.SLACK }
      ],
      ...actor
    });

    expect(updated.channels.map((c) => c.channelType).sort()).toEqual([
      AlertChannelType.SLACK,
      AlertChannelType.WEBHOOK
    ]);
    expect(memberships.get("alert-1")).toContain(keep.id);
    expect(memberships.get("alert-1")).toHaveLength(2);
  });

  test("update rejects a channel id that does not belong to the alert", async () => {
    const { service } = buildService();
    await service.createAlert(validCreate);
    await expect(
      service.updateAlert({
        alertId: "alert-1",
        channels: [{ id: "ch-foreign", name: "x", channelType: AlertChannelType.WEBHOOK }],
        ...actor
      })
    ).rejects.toThrow(/does not belong to this alert/);
  });

  test("update rejects an empty channel list", async () => {
    const { service } = buildService();
    await service.createAlert(validCreate);
    await expect(service.updateAlert({ alertId: "alert-1", channels: [], ...actor })).rejects.toThrow(
      "At least one channel is required"
    );
  });

  test("deletes an alert after checking Delete permission", async () => {
    const { service, permissionCalls } = buildService();
    await service.createAlert(validCreate);
    const result = await service.deleteAlert({ alertId: "alert-1", ...actor });
    expect(result.id).toBe("alert-1");
    expect(permissionCalls.some((c) => c.action === "delete")).toBe(true);
  });
});
