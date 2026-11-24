import { describe, expect, it, vi } from "vitest";

import { TApprovalRequests } from "@app/db/schemas";
import { NotificationType } from "@app/services/notification/notification-types";

import { dispatchApprovalNotification, TApprovalNotificationDeps } from "./approval-notification-fns";
import { ApprovalNotificationEvent, ApproverType } from "./approval-policy-enums";
import { TApprovalResource } from "./approval-policy-types";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

const request = { id: "request-1", organizationId: "org-1", requesterId: "requester" } as TApprovalRequests;

const approvers = [
  { type: ApproverType.User, id: "approver-1" },
  { type: ApproverType.Group, id: "group-1" }
];

const deliver = async (event: ApprovalNotificationEvent) => {
  const notificationService = { createUserNotifications: vi.fn().mockResolvedValue(undefined) };
  const deps = {
    userGroupMembershipDAL: {
      find: vi.fn().mockResolvedValue([{ userId: "approver-1" }, { userId: "group-member" }])
    },
    notificationService
  } as unknown as TApprovalNotificationDeps;
  const resource = {
    buildNotification: async () => ({
      inApp: { type: NotificationType.APPROVED_ACTION_FAILED, title: "Revocation Failed", body: "failed" }
    })
  } as unknown as TApprovalResource;

  await dispatchApprovalNotification({ event, request, resource, approvers }, deps);

  return notificationService.createUserNotifications.mock.calls.flatMap(([rows]) =>
    (rows as { userId: string }[]).map((row) => row.userId)
  );
};

describe("dispatchApprovalNotification recipients", () => {
  it("sends a failed approved action to the requester and every approver, once each", async () => {
    const recipients = await deliver(ApprovalNotificationEvent.ApprovedActionFailed);

    expect(recipients.sort()).toEqual(["approver-1", "group-member", "requester"]);
  });

  it("sends a decision to the requester only", async () => {
    const recipients = await deliver(ApprovalNotificationEvent.Approved);

    expect(recipients).toEqual(["requester"]);
  });
});
