import { ApprovalNotificationEvent } from "@app/services/approval-policy/approval-policy-enums";

import {
  buildPamAccessRequestEvent,
  PAM_FOLDER_RESOURCE_TYPE,
  PamAccessRequestEvent
} from "./pam-access-request-events";

const request = { requestId: "request-1", orgId: "org-1", projectId: "project-1", folderId: "folder-1" };

describe("buildPamAccessRequestEvent", () => {
  test("emits no PAM event when an approved action fails", () => {
    expect(
      buildPamAccessRequestEvent({ ...request, event: ApprovalNotificationEvent.ApprovedActionFailed })
    ).toBeNull();
  });

  test("emits the access-requested event for a new request", () => {
    expect(buildPamAccessRequestEvent({ ...request, event: ApprovalNotificationEvent.Requested })).toEqual({
      id: expect.any(String) as unknown,
      type: PamAccessRequestEvent.Requested,
      data: {
        orgId: "org-1",
        projectId: "project-1",
        resourceType: PAM_FOLDER_RESOURCE_TYPE,
        resourceId: "folder-1",
        targetIds: ["request-1"]
      }
    });
  });
});
