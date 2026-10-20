import { ApprovalNotificationEvent } from "@app/services/approval-policy/approval-policy-enums";
import { TEventInput } from "@app/services/event-outbox/event-outbox-types";

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
  [ApprovalNotificationEvent.Bypassed]: PamAccessRequestEvent.Bypassed
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
  eventType: EVENT_BY_APPROVAL_EVENT[event],
  payload: {
    orgId,
    projectId,
    resourceType: PAM_FOLDER_RESOURCE_TYPE,
    resourceId: folderId,
    targetIds: [requestId]
  }
});
