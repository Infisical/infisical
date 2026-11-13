import { describe, expect, it, vi } from "vitest";

import { ForbiddenRequestError } from "@app/lib/errors";

import {
  ApprovalNotificationEvent,
  ApprovalPolicyScope,
  ApprovalRequestApprovalDecision
} from "../approval-policy-enums";
import { certRevocationApprovalResourceFactory } from "./cert-revocation-policy-factory";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.example.com" })
}));

const applicationId = "6f1c1f1e-3a51-4b7e-9d7e-6c6d7f0b1a01";
const otherApplicationId = "6f1c1f1e-3a51-4b7e-9d7e-6c6d7f0b1a02";

const makePolicy = (overrides: Record<string, unknown>) => ({
  id: "policy",
  isActive: true,
  scopeType: ApprovalPolicyScope.PkiApplication,
  scopeId: applicationId,
  conditions: { version: 1, conditions: [{ profileNames: ["prod-tls"] }] },
  ...overrides
});

const setup = (policies: unknown[], memberships: unknown[] = []) => {
  const deps = {
    membershipDAL: { find: vi.fn().mockResolvedValue(memberships) },
    approvalPolicyDAL: {
      findByProjectId: vi
        .fn()
        .mockImplementation(async (_type: unknown, _projectId: string, scope: { scopeType: string; scopeId: string }) =>
          (policies as { scopeType: string | null; scopeId: string | null }[]).filter(
            (p) => p.scopeType === scope.scopeType && p.scopeId === scope.scopeId
          )
        )
    },
    certificateService: { revokeApprovedCertificate: vi.fn().mockResolvedValue(undefined) }
  };
  return { deps, resource: certRevocationApprovalResourceFactory(deps as never) };
};

describe("certRevocationApprovalResourceFactory.matchPolicy", () => {
  it("matches the Application's active policy that lists the certificate's profile", async () => {
    const { deps, resource } = setup([
      makePolicy({ id: "other-app", scopeId: otherApplicationId }),
      makePolicy({ id: "inactive", isActive: false }),
      makePolicy({ id: "legacy", scopeType: null, scopeId: null }),
      makePolicy({ id: "other-profile", conditions: { version: 1, conditions: [{ profileNames: ["dev-tls"] }] } }),
      makePolicy({ id: "match" })
    ]);

    const policy = await resource.matchPolicy("project", { profileName: "prod-tls", applicationId });

    expect(policy?.id).toBe("match");
    expect(deps.approvalPolicyDAL.findByProjectId).toHaveBeenCalledWith(expect.anything(), "project", {
      scopeType: ApprovalPolicyScope.PkiApplication,
      scopeId: applicationId
    });
  });

  it("matches nothing when no policy lists the certificate's profile", async () => {
    const { resource } = setup([makePolicy({})]);

    const policy = await resource.matchPolicy("project", { profileName: "dev-tls", applicationId });

    expect(policy).toBeNull();
  });
});

describe("certRevocationApprovalResourceFactory.postApprovalRoutine", () => {
  it("revokes the certificate the approved request names", async () => {
    const { deps, resource } = setup([]);
    const request = { id: "approval-1", requestData: { requestData: { certificateId: "cert-1" } } } as never;

    await resource.postApprovalRoutine!(request);

    expect(deps.certificateService.revokeApprovedCertificate).toHaveBeenCalledWith(request);
  });
});

describe("certRevocationApprovalResourceFactory.buildNotification", () => {
  const request = {
    id: "approval-1",
    type: "cert-revocation",
    organizationId: "org-1",
    requesterName: "Alice",
    requesterEmail: "alice@example.com",
    requestData: { requestData: { commonName: "api.example.com" } }
  } as never;

  it("asks approvers to review a new revocation request, naming the certificate", async () => {
    const { resource } = setup([]);

    const notification = await resource.buildNotification!({ event: ApprovalNotificationEvent.Requested, request });

    expect(notification?.inApp?.body).toContain("api.example.com");
    expect(notification?.inApp?.link).toContain("/cert-manager/approvals/approval-1?policyType=cert-revocation");
    expect(notification?.email?.substitutions.requestType).toBe("certificate revocation request");
  });

  it("tells everyone involved that an approved revocation didn't complete, and why, without guessing the certificate's state", async () => {
    const { resource } = setup([]);

    const notification = await resource.buildNotification!({
      event: ApprovalNotificationEvent.ApprovedActionFailed,
      request,
      failureReason: "AWS PCA timed out"
    });

    expect(notification?.inApp?.body).toBe(
      "The approved revocation of the certificate 'api.example.com' didn't complete. Reason: AWS PCA timed out"
    );
    expect(notification?.inApp?.link).toContain("/cert-manager/approvals/approval-1?policyType=cert-revocation");
  });

  it("sends nothing for decisions, which show on the certificate itself", async () => {
    const { resource } = setup([]);

    const notification = await resource.buildNotification!({ event: ApprovalNotificationEvent.Approved, request });

    expect(notification).toBeNull();
  });
});

describe("certRevocationApprovalResourceFactory live approver checks", () => {
  const actor = { id: "approver-1" } as never;
  const request = {
    projectId: "project",
    scopeType: ApprovalPolicyScope.PkiApplication,
    scopeId: applicationId
  } as never;
  const decision = ApprovalRequestApprovalDecision.Approved;

  const directMember = { actorUserId: "approver-1", actorGroupId: null, isActive: true };
  const groupMember = { actorUserId: null, actorGroupId: "group-1", isActive: true };
  const otherMember = { actorUserId: "someone-else", actorGroupId: null, isActive: true };

  it("lets a direct member of the request's Application review it", async () => {
    const { deps, resource } = setup([], [directMember]);

    await expect(
      resource.assertCanReview!({ request, decision, actor, userGroupIds: new Set() })
    ).resolves.toBeUndefined();
    await expect(
      resource.isLiveApprover!({ projectId: "project", scopeId: applicationId, actor, userGroupIds: new Set() })
    ).resolves.toBe(true);
    expect(deps.membershipDAL.find).toHaveBeenCalledWith(
      expect.objectContaining({ scopeProjectId: "project", scopeResourceId: applicationId })
    );
  });

  it("lets a member through one of their groups review it", async () => {
    const { resource } = setup([], [groupMember]);
    const userGroupIds = new Set(["group-1"]);

    await expect(resource.assertCanReview!({ request, decision, actor, userGroupIds })).resolves.toBeUndefined();
    await expect(
      resource.isLiveApprover!({ projectId: "project", scopeId: applicationId, actor, userGroupIds })
    ).resolves.toBe(true);
  });

  it("refuses a user removed from the Application", async () => {
    const { resource } = setup([], [otherMember, groupMember]);

    await expect(
      resource.assertCanReview!({ request, decision, actor, userGroupIds: new Set(["group-2"]) })
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
  });

  it("refuses a user whose Application membership is inactive", async () => {
    const { resource } = setup([], [{ ...directMember, isActive: false }]);

    await expect(
      resource.assertCanReview!({ request, decision, actor, userGroupIds: new Set() })
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
  });

  it("stops treating a user removed from the Application as an approver", async () => {
    const { resource } = setup([], [otherMember]);

    await expect(
      resource.isLiveApprover!({ projectId: "project", scopeId: applicationId, actor, userGroupIds: new Set() })
    ).resolves.toBe(false);
  });
});
