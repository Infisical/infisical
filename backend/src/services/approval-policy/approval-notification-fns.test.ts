import { describe, expect, it, vi } from "vitest";

import { TApprovalRequests } from "@app/db/schemas";
import { ChatMessage, ChatPostFailure } from "@app/domains/platform/workflow-integrations/ce/module";
import { FakeChatDeliveryService } from "@app/domains/platform/workflow-integrations/ce/testing/fake-chat-delivery-service";
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

describe("dispatchApprovalNotification chat", () => {
  const resourceWithChat = (chat: { workflowIntegrationId: string; channelIds: string[]; message: ChatMessage }[]) =>
    ({ buildNotification: async () => ({ chat }) }) as unknown as TApprovalResource;

  it("posts every delivery to its integration and keeps going after a refused channel or a missing integration", async () => {
    // Setup
    const chatDeliveryService = new FakeChatDeliveryService()
      .refuse("C1", { failure: ChatPostFailure.NotInChannel })
      .markMissing("integration-gone");
    const first = ChatMessage.slack({ text: "first" });
    const second = ChatMessage.slack({ text: "second" });
    const resource = resourceWithChat([
      { workflowIntegrationId: "integration-gone", channelIds: ["C0"], message: first },
      { workflowIntegrationId: "integration-a", channelIds: ["C1", "C2"], message: first },
      { workflowIntegrationId: "integration-b", channelIds: ["C3"], message: second }
    ]);
    const deps = {
      chatDeliveryService,
      userGroupMembershipDAL: { find: vi.fn().mockResolvedValue([]) }
    } as unknown as TApprovalNotificationDeps;

    // Action
    await dispatchApprovalNotification(
      { event: ApprovalNotificationEvent.Requested, request, resource, approvers },
      deps
    );

    // Assert
    expect(chatDeliveryService.posts).toEqual([
      { orgId: "org-1", integrationId: "integration-a", channelIds: ["C1", "C2"], message: first },
      { orgId: "org-1", integrationId: "integration-b", channelIds: ["C3"], message: second }
    ]);
  });
});
