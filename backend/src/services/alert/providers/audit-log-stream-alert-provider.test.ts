import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import {
  AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT,
  AuditLogStreamDeliveryFailedPayloadSchema,
  emitAuditLogStreamDeliveryFailed
} from "@app/ee/services/audit-log-stream/audit-log-stream-events";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { ActorType } from "@app/services/auth/auth-type";

import { AlertPermissionAction } from "../alert-types";
import { auditLogStreamAlertProviderFactory } from "./audit-log-stream-alert-provider";

const ORG_ID = "org-1";
const STREAM_ID = "stream-1";
const FAILING_SINCE = new Date("2026-10-07T10:00:00.000Z");

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
