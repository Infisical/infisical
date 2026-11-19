import { describe, expect, it, vi } from "vitest";

import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";

import {
  ApprovalNotificationEvent,
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApprovalRequestApprovalDecision,
  ApproverType
} from "../approval-policy-enums";
import { certDeletionApprovalResourceFactory } from "./cert-deletion-policy-factory";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.example.com" })
}));

const applicationId = "6f1c1f1e-3a51-4b7e-9d7e-6c6d7f0b1a01";
const primaryDb = { node: "primary" };

type TTestMembership = { actorUserId: string | null; actorGroupId: string | null; role?: string };

const setup = (policies: unknown[] = [], memberships: TTestMembership[] = []) => {
  const withIds = memberships.map((m, i) => ({ ...m, id: `membership-${i}`, isActive: true, scopeOrgId: "org-1" }));
  const deps = {
    membershipDAL: {
      find: vi
        .fn()
        .mockImplementation(async (filter: { scope: string; $in?: { actorUserId?: string[] } }) =>
          filter.scope === "organization"
            ? (filter.$in?.actorUserId ?? []).map((actorUserId) => ({ actorUserId }))
            : withIds
        )
    },
    membershipRoleDAL: {
      find: vi
        .fn()
        .mockImplementation(async ({ $in }: { $in: { membershipId: string[] } }) =>
          withIds
            .filter((m) => $in.membershipId.includes(m.id))
            .map((m) => ({ membershipId: m.id, role: m.role ?? "operator" }))
        )
    },
    userGroupMembershipDAL: { find: vi.fn().mockResolvedValue([]) },
    orgDAL: {
      findMembership: vi
        .fn()
        .mockImplementation(async (filter: { $in: { actorUserId: string[] } }) =>
          filter.$in.actorUserId.map((actorUserId) => ({ actorUserId, isActive: true, status: "accepted" }))
        ),
      findActorsWithActiveOrgAccess: vi.fn().mockResolvedValue({ userIds: new Set(), identityIds: new Set() }),
      findById: vi.fn().mockResolvedValue({ id: "org-1", rootOrgId: null })
    },
    userDAL: {
      find: vi.fn().mockImplementation(async ({ $in }: { $in: { id: string[] } }) =>
        $in.id.map((id) => ({
          id,
          isAccepted: true,
          firstName: "Ada",
          lastName: "Auditor",
          email: `${id}@example.com`
        }))
      )
    },
    groupDAL: { find: vi.fn().mockResolvedValue([]) },
    approvalPolicyDAL: {
      findByProjectId: vi.fn().mockResolvedValue(policies),
      primaryNode: vi.fn().mockReturnValue(primaryDb)
    },
    certificateService: { deleteApprovedCertificate: vi.fn().mockResolvedValue(undefined) }
  };
  return { deps, resource: certDeletionApprovalResourceFactory(deps as never) };
};

const deletionPolicy = {
  id: "policy",
  isActive: true,
  scopeType: ApprovalPolicyScope.PkiApplication,
  scopeId: applicationId,
  conditions: { version: 1, conditions: [{ profileNames: ["prod-tls"] }] },
  steps: [
    {
      requiredApprovals: 1,
      approvers: [
        { type: ApproverType.User, id: "operator" },
        { type: ApproverType.User, id: "auditor" }
      ]
    }
  ]
};

describe("certDeletionApprovalResourceFactory.matchPolicy", () => {
  it("looks up deletion policies on the primary and keeps only the approvers who can approve now", async () => {
    const { deps, resource } = setup(
      [deletionPolicy],
      [
        { actorUserId: "operator", actorGroupId: null },
        { actorUserId: "auditor", actorGroupId: null, role: "auditor" }
      ]
    );

    const policy = await resource.matchPolicy("project", { profileName: "prod-tls", applicationId });

    expect(deps.approvalPolicyDAL.findByProjectId).toHaveBeenCalledWith(
      ApprovalPolicyType.CertDeletion,
      "project",
      { scopeType: ApprovalPolicyScope.PkiApplication, scopeId: applicationId },
      primaryDb
    );
    expect(policy?.steps).toEqual([
      expect.objectContaining({ approvers: [{ type: ApproverType.User, id: "operator" }], approverCount: 1 })
    ]);
  });

  it("matches nothing when no deletion policy lists the certificate's profile", async () => {
    const { resource } = setup([deletionPolicy]);

    await expect(resource.matchPolicy("project", { profileName: "dev-tls", applicationId })).resolves.toBeNull();
  });
});

describe("certDeletionApprovalResourceFactory approver checks", () => {
  const request = { projectId: "project", scopeType: ApprovalPolicyScope.PkiApplication, scopeId: applicationId };

  it("refuses an Auditor's review of a deletion request", async () => {
    const { resource } = setup([], [{ actorUserId: "auditor", actorGroupId: null, role: "auditor" }]);

    await expect(
      resource.assertCanReview!({
        request: request as never,
        decision: ApprovalRequestApprovalDecision.Approved,
        actor: { id: "auditor" } as never,
        userGroupIds: new Set(),
        stepApprovers: [{ type: ApproverType.User, id: "auditor" }]
      })
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
  });

  it("refuses to save an Auditor as a deletion approver, naming them", async () => {
    const { resource } = setup([], [{ actorUserId: "auditor", actorGroupId: null, role: "auditor" }]);

    const result = resource.verifyPolicyActors!({
      projectId: "project",
      scopeId: applicationId,
      approvers: [{ type: ApproverType.User, id: "auditor" }],
      bypassers: []
    });

    await expect(result).rejects.toBeInstanceOf(BadRequestError);
    await expect(result).rejects.toThrow(
      "Deletion approvers need an Admin or Operator role in the Application, so they can approve requests. These approvers are Auditors or aren't in the Application: users Ada Auditor."
    );
  });

  it("finds a pending deletion request undecidable once its only approver is an Auditor", async () => {
    const { resource } = setup([], [{ actorUserId: "auditor", actorGroupId: null, role: "auditor" }]);

    const undecidable = await resource.findUndecidableRequestIds!({
      requests: [
        {
          request: { id: "request-1", projectId: "project", scopeId: applicationId, currentStep: 1 } as never,
          steps: [
            {
              stepNumber: 1,
              requiredApprovals: 1,
              approvers: [{ type: ApproverType.User, id: "auditor" }],
              approvals: []
            }
          ]
        }
      ],
      tx: primaryDb as never
    });

    expect(undecidable).toEqual(new Set(["request-1"]));
  });
});

describe("certDeletionApprovalResourceFactory.buildNotification", () => {
  const buildRequest = (requestData: Record<string, unknown>) =>
    ({
      id: "approval-1",
      type: ApprovalPolicyType.CertDeletion,
      organizationId: "org-1",
      requesterName: "Alice",
      requesterEmail: "alice@example.com",
      requestData: { requestData }
    }) as never;

  it("asks approvers to review a new deletion request, linking to it", async () => {
    const { resource } = setup();

    const notification = await resource.buildNotification!({
      event: ApprovalNotificationEvent.Requested,
      request: buildRequest({ commonName: "api.example.com", serialNumber: "0a1b" })
    });

    expect(notification?.inApp?.body).toBe("Alice asked to delete the certificate 'api.example.com'.");
    expect(notification?.inApp?.link).toBe(
      "https://app.example.com/organizations/org-1/cert-manager/approvals/approval-1?policyType=cert-deletion&from=root-requests"
    );
    expect(notification?.email?.substitutions.requestType).toBe("certificate deletion request");
  });

  it("names the certificate by its friendly name, then serial number, never leaving the name empty", async () => {
    const { resource } = setup();

    const named = await resource.buildNotification!({
      event: ApprovalNotificationEvent.Requested,
      request: buildRequest({ commonName: "", friendlyName: "edge-proxy", serialNumber: "0a1b" })
    });
    const unnamed = await resource.buildNotification!({
      event: ApprovalNotificationEvent.ApprovedActionFailed,
      request: buildRequest({ commonName: "", friendlyName: null, serialNumber: "0a1b" }),
      failureReason: "Certificate '0a1b' is now used by a code signing signer, so it wasn't deleted."
    });

    expect(named?.inApp?.body).toBe("Alice asked to delete the certificate 'edge-proxy'.");
    expect(unnamed?.inApp).toMatchObject({
      title: "Certificate Deletion Failed",
      body: "The approved deletion of the certificate '0a1b' didn't complete. Reason: Certificate '0a1b' is now used by a code signing signer, so it wasn't deleted."
    });
  });

  it("sends nothing for decisions", async () => {
    const { resource } = setup();

    await expect(
      resource.buildNotification!({
        event: ApprovalNotificationEvent.Approved,
        request: buildRequest({ commonName: "api.example.com", serialNumber: "0a1b" })
      })
    ).resolves.toBeNull();
  });
});

describe("certDeletionApprovalResourceFactory.postApprovalRoutine", () => {
  it("deletes the certificate the approved request names", async () => {
    const { deps, resource } = setup();
    const request = { id: "approval-1" } as never;

    await resource.postApprovalRoutine!(request);

    expect(deps.certificateService.deleteApprovedCertificate).toHaveBeenCalledWith(request);
  });
});
