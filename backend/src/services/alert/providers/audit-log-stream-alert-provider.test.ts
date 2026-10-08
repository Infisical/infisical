import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import {
  AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT,
  AUDIT_LOG_STREAM_RESOURCE_TYPE,
  AuditLogStreamDeliveryFailedPayloadSchema,
  emitAuditLogStreamDeliveryFailed
} from "@app/ee/services/audit-log-stream/audit-log-stream-events";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { ActorType } from "@app/services/auth/auth-type";

import { AlertPermissionAction, AlertTriggerType, TAlertContext } from "../alert-types";
import { auditLogStreamAlertProviderFactory } from "./audit-log-stream-alert-provider";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com" })
}));

const ORG_ID = "org-1";
const STREAM_ID = "stream-1";
const FAILING_SINCE = new Date("2026-10-07T10:00:00.000Z");

const alertContext = (overrides: Partial<TAlertContext> = {}): TAlertContext => ({
  id: "alert-1",
  name: "stream-down",
  orgId: ORG_ID,
  resourceType: AUDIT_LOG_STREAM_RESOURCE_TYPE,
  resourceId: null,
  eventType: AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT,
  condition: null,
  ...overrides
});

const buildProvider = (abilityRules: Parameters<typeof createMongoAbility>[0] = []) => {
  const auditLogStreamAlertDAL = {
    findStreamInOrg: vi.fn<(id: string, orgId: string) => Promise<{ id: string; provider: string } | undefined>>(
      async (id) => ({ id, provider: "datadog" })
    ),
    findStreamsByIds: vi.fn<(ids: string[], orgId: string) => Promise<{ id: string; provider: string }[]>>(
      async (ids) => ids.map((id) => ({ id, provider: "datadog" }))
    )
  };
  const permissionService = {
    getOrgPermission: vi.fn(async () => ({ permission: createMongoAbility(abilityRules) }))
  };
  const provider = auditLogStreamAlertProviderFactory({
    auditLogStreamAlertDAL: auditLogStreamAlertDAL as never,
    permissionService: permissionService as never
  });
  return { provider, auditLogStreamAlertDAL, permissionService };
};

const actor = { actor: ActorType.USER, actorId: "user-1", actorAuthMethod: null, actorOrgId: ORG_ID };

describe("audit-log-stream alert provider", () => {
  test("declares one event-triggered event", () => {
    const { provider } = buildProvider();
    expect(provider.resourceType).toBe("audit-log.stream");
    expect(provider.events).toHaveLength(1);
    expect(provider.events[0].key).toBe(AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT);
    expect(provider.events[0].triggerType).toBe(AlertTriggerType.Event);
  });

  test("findEventTargets reads what the emit helper writes", async () => {
    const { provider, auditLogStreamAlertDAL } = buildProvider();
    const emit = vi.fn(async () => undefined);
    await emitAuditLogStreamDeliveryFailed(
      { emit },
      {
        orgId: ORG_ID,
        streamId: STREAM_ID,
        provider: "datadog",
        errorMessage: "Request failed with status code 403",
        droppedCount: 3,
        failingSince: FAILING_SINCE
      },
      {} as never
    );
    const { payload } = (emit.mock.calls[0] as unknown as [{ payload: Record<string, unknown> }])[0];

    expect(AuditLogStreamDeliveryFailedPayloadSchema.safeParse(payload).success).toBe(true);

    const targets = await provider.findEventTargets({
      orgId: ORG_ID,
      eventType: AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT,
      condition: null,
      targetIds: payload.targetIds as string[],
      payload
    });

    expect(auditLogStreamAlertDAL.findStreamsByIds).toHaveBeenCalledWith([STREAM_ID], ORG_ID);
    expect(targets).toEqual([
      {
        streamId: STREAM_ID,
        provider: "datadog",
        errorMessage: "Request failed with status code 403",
        droppedCount: 3,
        failingSince: FAILING_SINCE
      }
    ]);
  });

  test("findEventTargets drops a stream deleted before delivery", async () => {
    const { provider, auditLogStreamAlertDAL } = buildProvider();
    auditLogStreamAlertDAL.findStreamsByIds.mockResolvedValueOnce([]);

    const targets = await provider.findEventTargets({
      orgId: ORG_ID,
      eventType: AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT,
      condition: null,
      targetIds: [STREAM_ID],
      payload: {
        provider: "datadog",
        errorMessage: "boom",
        droppedCount: 1,
        failingSince: FAILING_SINCE.toISOString()
      }
    });

    expect(targets).toEqual([]);
  });

  test("findEventTargets throws on an unreadable payload", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.findEventTargets({
        orgId: ORG_ID,
        eventType: AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT,
        condition: null,
        targetIds: [STREAM_ID],
        payload: {}
      })
    ).rejects.toThrow(/Unreadable/);
  });

  test("buildPayload names the stream, error and drop count and links to the streams tab", async () => {
    const { provider } = buildProvider();
    const viewUrl = await provider.buildViewUrl(alertContext());
    expect(viewUrl).toBe("https://app.infisical.com/organizations/org-1/audit-logs?selectedTab=streams");

    const payload = provider.buildPayload(
      alertContext(),
      [
        {
          streamId: STREAM_ID,
          provider: "sumo-logic",
          errorMessage: "timeout of 5000ms exceeded",
          droppedCount: 12,
          failingSince: FAILING_SINCE
        }
      ],
      viewUrl
    );

    expect(payload.severity).toBe("critical");
    expect(payload.summary).toContain("Sumo Logic");
    expect(payload.items[0].id).toBe(provider.targetId({ streamId: STREAM_ID } as never));
    expect(payload.items[0].fields).toEqual(
      expect.arrayContaining([
        { label: "Error", value: "timeout of 5000ms exceeded" },
        { label: "Dropped Events", value: "12" }
      ])
    );
  });

  test("assertResourceInScope rejects a stream from another org", async () => {
    const { provider, auditLogStreamAlertDAL } = buildProvider();
    auditLogStreamAlertDAL.findStreamInOrg.mockResolvedValueOnce(undefined);

    await expect(provider.assertResourceInScope({ orgId: ORG_ID, resourceId: STREAM_ID })).rejects.toThrow(
      /not found in this organization/
    );
    await expect(provider.assertResourceInScope({ orgId: ORG_ID, resourceId: null })).resolves.toBeUndefined();
  });

  test("assertPermission needs settings read to read and settings edit to write", async () => {
    const reader = buildProvider([{ action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Settings }]);
    await expect(
      reader.provider.assertPermission({ action: AlertPermissionAction.Read, orgId: ORG_ID, actor })
    ).resolves.toBeUndefined();
    await expect(
      reader.provider.assertPermission({ action: AlertPermissionAction.Create, orgId: ORG_ID, actor })
    ).rejects.toThrow();

    const editor = buildProvider([
      { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Settings },
      { action: OrgPermissionActions.Edit, subject: OrgPermissionSubjects.Settings }
    ]);
    await expect(
      editor.provider.assertPermission({ action: AlertPermissionAction.Create, orgId: ORG_ID, actor })
    ).resolves.toBeUndefined();
  });
});
