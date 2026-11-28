import {
  PamAccessRequestClosedEvent,
  PamAccessRequestEvent
} from "@app/ee/services/pam-access-request/pam-access-request-events";
import {
  ApprovalRequestApprovalDecision,
  ApprovalRequestStatus
} from "@app/services/approval-policy/approval-policy-enums";

import { alertProviderRegistryFactory } from "../alert-provider-registry";
import { AlertMessageOutcome } from "../alert-types";
import { TPamFolderAlertDALFactory } from "./pam-folder-alert-dal";
import { pamFolderAlertProviderFactory } from "./pam-folder-alert-provider";

const UPDATED_AT = new Date("2026-11-27T19:13:00.000Z");
const EXPIRES_AT = new Date("2026-11-27T18:00:00.000Z");

const request = (id: string, status: ApprovalRequestStatus, overrides: Record<string, unknown> = {}) => ({
  id,
  requesterId: "carol-id",
  requesterName: "Carol Tester",
  requesterEmail: "carol@example.com",
  machineIdentityId: null,
  requestData: {},
  status,
  updatedAt: UPDATED_AT,
  expiresAt: null,
  ...overrides
});

const decision = (requestId: string, firstName: string, comment: string | null) => ({
  requestId,
  comment,
  firstName,
  lastName: "Approver",
  email: `${firstName.toLowerCase()}@example.com`
});

const setup = ({
  requests,
  approvals = [],
  rejections = [],
  grants = []
}: {
  requests: ReturnType<typeof request>[];
  approvals?: ReturnType<typeof decision>[];
  rejections?: ReturnType<typeof decision>[];
  grants?: { requestId: string; bypassReason: string | null }[];
}) => {
  const findDecisionCommentsByRequestIds = vi.fn(
    async ({ decision: wanted }: { decision: ApprovalRequestApprovalDecision }) =>
      wanted === ApprovalRequestApprovalDecision.Approved ? approvals : rejections
  );
  const pamFolderAlertDAL = {
    findAccessRequestsByIds: vi.fn(async () => requests),
    findDecisionCommentsByRequestIds,
    findBypassReasonsByRequestIds: vi.fn(async () => grants)
  } as unknown as TPamFolderAlertDALFactory;
  const provider = pamFolderAlertProviderFactory({
    pamFolderAlertDAL,
    projectPermissionService: {} as never,
    pamPermissionService: {} as never,
    licenseService: {} as never
  });
  const resolve = (targetIds: string[], projectId: string | null = "project-1") =>
    provider.messageResolver!.resolveTargets({ orgId: "org-1", projectId, targetIds });
  return { provider, resolve, findDecisionCommentsByRequestIds };
};

describe("pam.folder messageResolver", () => {
  test("names the last approver and their comment on an approved request", async () => {
    const { resolve } = setup({
      requests: [request("r1", ApprovalRequestStatus.Approved)],
      approvals: [decision("r1", "Alice", "first"), decision("r1", "Bernie", "final")],
      grants: [{ requestId: "r1", bypassReason: null }]
    });

    expect((await resolve(["r1"])).get("r1")).toEqual({
      outcome: AlertMessageOutcome.Approved,
      resolvedAt: UPDATED_AT,
      actorName: "Bernie Approver",
      comment: "final"
    });
  });

  test("names the approver who denied a request", async () => {
    const { resolve } = setup({
      requests: [request("r1", ApprovalRequestStatus.Rejected)],
      rejections: [decision("r1", "Bernie", "Use the replica")]
    });

    expect((await resolve(["r1"])).get("r1")).toMatchObject({
      outcome: AlertMessageOutcome.Denied,
      actorName: "Bernie Approver",
      comment: "Use the replica"
    });
  });

  test("shows the requester and their reason for break-glass", async () => {
    const { resolve } = setup({
      requests: [request("r1", ApprovalRequestStatus.Approved)],
      approvals: [decision("r1", "Carol", null)],
      grants: [{ requestId: "r1", bypassReason: "Prod outage" }]
    });

    expect((await resolve(["r1"])).get("r1")).toMatchObject({
      outcome: AlertMessageOutcome.BreakGlass,
      actorName: "Carol Tester",
      comment: "Prod outage"
    });
  });

  test("approves without an actor when no one approved by hand", async () => {
    const { resolve } = setup({ requests: [request("r1", ApprovalRequestStatus.Approved)] });

    expect((await resolve(["r1"])).get("r1")).toMatchObject({ outcome: AlertMessageOutcome.Approved, actorName: null });
  });

  test("dates an expired request by when it expired, not when it was swept", async () => {
    const { resolve } = setup({
      requests: [
        request("r1", ApprovalRequestStatus.Expired, { expiresAt: EXPIRES_AT }),
        request("r2", ApprovalRequestStatus.Cancelled)
      ]
    });

    const resolutions = await resolve(["r1", "r2"]);
    expect(resolutions.get("r1")).toEqual({
      outcome: AlertMessageOutcome.Expired,
      resolvedAt: EXPIRES_AT,
      actorName: null,
      comment: null
    });
    expect(resolutions.get("r2")).toMatchObject({ outcome: AlertMessageOutcome.Cancelled, resolvedAt: UPDATED_AT });
  });

  test("leaves pending requests and requests without a project unresolved", async () => {
    const { resolve, findDecisionCommentsByRequestIds } = setup({
      requests: [request("r1", ApprovalRequestStatus.Pending)]
    });

    expect((await resolve(["r1"])).size).toBe(0);
    expect((await resolve(["r1"], null)).size).toBe(0);
    expect(findDecisionCommentsByRequestIds).not.toHaveBeenCalled();
  });

  test("subscribes to every closing event without offering the closed-only ones as alerts", () => {
    const registry = alertProviderRegistryFactory();
    registry.register(setup({ requests: [] }).provider);

    expect([...registry.messageClosingKeys()].sort()).toEqual(
      [
        PamAccessRequestEvent.Approved,
        PamAccessRequestEvent.Denied,
        PamAccessRequestEvent.Bypassed,
        PamAccessRequestClosedEvent.Cancelled,
        PamAccessRequestClosedEvent.Expired
      ].sort()
    );
    expect(registry.eventTriggeredKeys().has(PamAccessRequestClosedEvent.Cancelled)).toBe(false);
    expect(registry.eventTriggeredKeys().has(PamAccessRequestClosedEvent.Expired)).toBe(false);
  });
});
