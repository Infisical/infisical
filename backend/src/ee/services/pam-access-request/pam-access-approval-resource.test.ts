import { WorkflowIntegrationProvider } from "@app/domains/platform/workflow-integrations/ce/module";
import { FakeWorkflowIntegrationService } from "@app/domains/platform/workflow-integrations/ce/testing/fake-workflow-integration-service";
import {
  microsoftTeamsIntegration,
  slackIntegration
} from "@app/domains/platform/workflow-integrations/ce/testing/workflow-integration-fixture";
import { ApprovalNotificationEvent, ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { TPamAccessPolicy } from "@app/services/approval-policy/pam-access/pam-access-policy-types";

import { PamNotificationEvent } from "../pam/pam-enums";
import { pamAccessApprovalResourceFactory } from "./pam-access-approval-resource";
import { TPamAccessRequestData } from "./pam-access-request-types";

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({ SITE_URL: "https://app.example.com" })
}));

const ACCOUNT_ID = "6cb4b2fa-1a9f-4b31-9f2d-6f3f5f9d4a11";
const FOLDER_ID = "9f8e7d6c-5b4a-4938-8271-6a5b4c3d2e33";

const buildResource = (approvalPolicyDAL: unknown) => pamAccessApprovalResourceFactory({ approvalPolicyDAL } as never);

describe("pam access resource: validateConstraints", () => {
  const { validateConstraints } = buildResource({});

  const policy = {
    constraints: { version: 1, constraints: { accessDuration: { min: "30m", max: "8h" } } }
  } as TPamAccessPolicy;

  const requestData = (duration: string) =>
    ({ accountId: ACCOUNT_ID, folderId: FOLDER_ID, duration }) as TPamAccessRequestData;

  test("accepts a duration inside the policy's window", () => {
    expect(validateConstraints(policy, requestData("2h"))).toEqual({ valid: true, errors: undefined });
  });

  test("names the bound a duration missed", () => {
    expect(validateConstraints(policy, requestData("5m")).errors).toEqual(["Access duration must be at least 30m"]);
    expect(validateConstraints(policy, requestData("2d")).errors).toEqual(["Access duration must be at most 8h"]);
  });

  test("reports an unparseable duration rather than comparing NaN", () => {
    const result = validateConstraints(policy, requestData("2h30m"));
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toContain("Invalid access duration '2h30m'");
  });
});

describe("pam access resource: matchPolicy", () => {
  test("looks the policy up by the folder the account sits in", async () => {
    const policy = { id: "policy" };
    const findByProjectId = vi.fn().mockResolvedValue([policy]);

    const matched = await buildResource({ findByProjectId }).matchPolicy("project", {
      accountId: ACCOUNT_ID,
      folderId: FOLDER_ID
    });

    expect(matched).toBe(policy);
    expect(findByProjectId).toHaveBeenCalledWith(ApprovalPolicyType.PamAccess, "project", {
      scopeType: "pam-folder",
      scopeId: FOLDER_ID
    });
  });

  test("returns null for a folder with no policy", async () => {
    const resource = buildResource({ findByProjectId: vi.fn().mockResolvedValue([]) });

    await expect(resource.matchPolicy("project", { accountId: ACCOUNT_ID, folderId: FOLDER_ID })).resolves.toBeNull();
  });
});

describe("pam access resource: buildNotification email", () => {
  const buildWithFolder = (folder: { name: string; emailApproversOnRequest: boolean } | null) =>
    pamAccessApprovalResourceFactory({
      pamAccountDAL: { findByIdWithDetails: vi.fn().mockResolvedValue({ name: "prod-db" }) },
      pamFolderDAL: { findById: vi.fn().mockResolvedValue(folder) },
      pamFolderNotificationConfigDAL: { findByFolderId: vi.fn().mockResolvedValue([]) },
      workflowIntegrationService: new FakeWorkflowIntegrationService()
    } as never);

  const request = {
    id: "request",
    organizationId: "org",
    requesterName: "Jane",
    requesterEmail: "jane@example.com",
    requestData: { version: 1, requestData: { accountId: ACCOUNT_ID, folderId: FOLDER_ID, duration: "1h" } }
  } as never;

  test.each([
    ["off", { name: "prod", emailApproversOnRequest: false }, false],
    ["on", { name: "prod", emailApproversOnRequest: true }, true],
    ["unknown for a deleted folder", null, true]
  ])("emails approvers about a new request when the folder setting is %s", async (_label, folder, emailed) => {
    const content = await buildWithFolder(folder).buildNotification!({
      event: ApprovalNotificationEvent.Requested,
      request
    });

    expect(Boolean(content?.email)).toBe(emailed);
    expect(content?.inApp).toBeDefined();
  });

  test("still emails approvers about break-glass use when request emails are off", async () => {
    const content = await buildWithFolder({ name: "prod", emailApproversOnRequest: false }).buildNotification!({
      event: ApprovalNotificationEvent.Bypassed,
      request,
      bypassReason: "outage"
    });

    expect(content?.email).toBeDefined();
  });
});

describe("pam access resource: buildNotification chat", () => {
  const request = {
    id: "request",
    organizationId: "org",
    requesterName: "Jane",
    requesterEmail: "jane@example.com",
    requestData: { version: 1, requestData: { accountId: ACCOUNT_ID, folderId: FOLDER_ID, duration: "1h" } }
  } as never;

  test("posts to the folder's installed Slack integrations that subscribe to the event, merging channels", async () => {
    // Setup
    const slack = slackIntegration({ orgId: "org" });
    const teams = microsoftTeamsIntegration({ orgId: "org" });
    const otherOrgSlack = slackIntegration({ orgId: "other-org" });
    const config = (workflowIntegrationId: string, channelId: string, events: string[]) => ({
      workflowIntegrationId,
      channels: [{ id: channelId, name: channelId }],
      events
    });
    const resource = pamAccessApprovalResourceFactory({
      pamAccountDAL: { findByIdWithDetails: vi.fn().mockResolvedValue({ name: "prod-db" }) },
      pamFolderDAL: { findById: vi.fn().mockResolvedValue({ name: "prod", emailApproversOnRequest: true }) },
      pamFolderNotificationConfigDAL: {
        findByFolderId: vi
          .fn()
          .mockResolvedValue([
            config(slack.id, "C1", [PamNotificationEvent.AccessRequested]),
            config(slack.id, "C2", [PamNotificationEvent.AccessRequested]),
            config(slack.id, "C3", [PamNotificationEvent.AccessRequestDenied]),
            config(teams.id, "C4", [PamNotificationEvent.AccessRequested]),
            config(otherOrgSlack.id, "C5", [PamNotificationEvent.AccessRequested])
          ])
      },
      workflowIntegrationService: new FakeWorkflowIntegrationService().add(slack, teams, otherOrgSlack)
    } as never);

    // Action
    const content = await resource.buildNotification!({ event: ApprovalNotificationEvent.Requested, request });

    // Assert
    expect(content?.chat).toHaveLength(1);
    expect(content?.chat?.[0]).toMatchObject({ workflowIntegrationId: slack.id, channelIds: ["C1", "C2"] });
    expect(content?.chat?.[0].message.provider).toBe(WorkflowIntegrationProvider.Slack);
  });
});
