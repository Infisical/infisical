import crypto from "node:crypto";

import { TEventInput } from "@app/domains/platform/events/ce/module";
import { ApprovalNotificationEvent } from "@app/services/approval-policy/approval-policy-enums";

export const PAM_FOLDER_RESOURCE_TYPE = "pam.folder";

export enum PamAccessRequestEvent {
  Requested = "pam.folder.access-requested",
  Approved = "pam.folder.access-request-approved",
  Denied = "pam.folder.access-request-denied",
  Bypassed = "pam.folder.access-request-bypassed"
}

const EVENT_BY_APPROVAL_EVENT: Record<ApprovalNotificationEvent, PamAccessRequestEvent> = {
  [ApprovalNotificationEvent.Requested]: PamAccessRequestEvent.Requested,
  [ApprovalNotificationEvent.Approved]: PamAccessRequestEvent.Approved,
  [ApprovalNotificationEvent.Rejected]: PamAccessRequestEvent.Denied,
  [ApprovalNotificationEvent.Bypassed]: PamAccessRequestEvent.Bypassed,
  [ApprovalNotificationEvent.AutoApproved]: PamAccessRequestEvent.Approved
};

export const buildPamAccessRequestEvent = ({
  event,
  requestId,
  orgId,
  projectId,
  folderId
}: {
  event: ApprovalNotificationEvent;
  requestId: string;
  orgId: string;
  projectId: string;
  folderId: string;
}): TEventInput => ({
  id: crypto.randomUUID(),
  type: EVENT_BY_APPROVAL_EVENT[event],
  data: {
    orgId,
    projectId,
    resourceType: PAM_FOLDER_RESOURCE_TYPE,
    resourceId: folderId,
    targetIds: [requestId]
  }
});
