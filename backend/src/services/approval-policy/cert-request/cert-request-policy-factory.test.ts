import { describe, expect, it, vi } from "vitest";

import { ProjectMembershipRole } from "@app/db/schemas/models";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import {
  ApprovalNotificationEvent,
  ApprovalPolicyScope,
  ApprovalRequestStatus,
  ApproverType
} from "../approval-policy-enums";
import { certRequestApprovalResourceFactory } from "./cert-request-policy-factory";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.example.com" })
}));

describe("certRequestApprovalResourceFactory.postApprovalRoutine", () => {
  const request = {
    id: "approval-1",
    requestData: { requestData: { certificateRequestId: "cert-req-1" } }
  } as never;

  const setup = (issueCertificate: () => Promise<unknown>) => {
    const failedRequest = { id: "cert-req-1", status: CertificateRequestStatus.FAILED };
    const deps = {
      approvalPolicyDAL: { findByProjectId: vi.fn(), findById: vi.fn().mockResolvedValue({ name: "prod renewals" }) },
      approvalPolicyService: { notifyApprovedActionFailed: vi.fn().mockResolvedValue(undefined) },
      auditLogService: { createAuditLog: vi.fn().mockResolvedValue(undefined) },
      certificateApprovalService: { issueCertificate: vi.fn(issueCertificate) },
      certificateRequestDAL: {
        updateById: vi.fn().mockResolvedValue(failedRequest),
        transitionFromPending: vi.fn().mockResolvedValue(failedRequest),
        findById: vi.fn()
      },
      certificateRequestService: { recordIssuanceFailure: vi.fn() },
      certificateRenewalService: {
        renewApprovedCertificate: vi.fn().mockResolvedValue(undefined),
        recordRejectedRenewal: vi.fn().mockResolvedValue(undefined)
      },
      telemetryService: { sendPostHogEvents: vi.fn().mockResolvedValue(undefined) }
    };
    return { deps, failedRequest, resource: certRequestApprovalResourceFactory(deps as never) };
  };

  it("records the issuance failure with the original error and lets the operation be derived", async () => {
    const error = new Error("CA is disabled");
    const { deps, failedRequest, resource } = setup(() => Promise.reject(error));

    await resource.postApprovalRoutine!(request);

    expect(deps.certificateRequestDAL.transitionFromPending).toHaveBeenCalledWith(
      "cert-req-1",
      CertificateRequestStatus.FAILED,
      "CA is disabled"
    );
    expect(deps.certificateRequestService.recordIssuanceFailure).toHaveBeenCalledWith(failedRequest, { error });
    expect(deps.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(
      request,
      "An unexpected error stopped the certificate from being issued."
    );
  });

  it("issues an approved renewal as a renewal of the original certificate", async () => {
    const { deps, resource } = setup(() => Promise.resolve());
    const renewal = { certificateId: "cert-1", renewalKeySource: "new" };
    const certificateRequest = { commonName: "a.example.com", validity: { ttl: "30d" } };

    await resource.postApprovalRoutine!({
      id: "approval-1",
      organizationId: "org-1",
      requestData: { requestData: { certificateRequestId: "cert-req-1", renewal, certificateRequest } }
    } as never);

    expect(deps.certificateRenewalService.renewApprovedCertificate).toHaveBeenCalledWith({
      certificateRequestId: "cert-req-1",
      organizationId: "org-1",
      renewal,
      reviewedCertificateRequest: certificateRequest
    });
    expect(deps.certificateApprovalService.issueCertificate).not.toHaveBeenCalled();
  });

  it("reports the renewal to telemetry once an approved renewal is issued", async () => {
    const { deps, resource } = setup(() => Promise.resolve());

    await resource.postApprovalRoutine!({
      id: "approval-1",
      organizationId: "org-1",
      projectId: "project-1",
      requesterId: "user-1",
      requesterEmail: "john.smith@example.com",
      requestData: { requestData: { certificateRequestId: "cert-req-1", renewal: { certificateId: "cert-1" } } }
    } as never);

    expect(deps.telemetryService.sendPostHogEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        event: PostHogEventTypes.CertificateRenewed,
        distinctId: "john.smith@example.com",
        properties: { orgId: "org-1", projectId: "project-1" }
      })
    );
  });

  it("reports no renewal to telemetry when the approved renewal fails", async () => {
    const { deps, resource } = setup(() => Promise.resolve());
    deps.certificateRenewalService.renewApprovedCertificate.mockRejectedValue(new Error("CA is disabled"));

    await resource.postApprovalRoutine!({
      id: "approval-1",
      organizationId: "org-1",
      requesterId: "user-1",
      requesterEmail: "john.smith@example.com",
      requestData: { requestData: { certificateRequestId: "cert-req-1", renewal: { certificateId: "cert-1" } } }
    } as never);

    expect(deps.telemetryService.sendPostHogEvents).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a check Infisical makes, without blaming the CA",
      new BadRequestError({ message: "Certificate is not eligible for renewal: Certificate Authority is disabled" }),
      "Certificate is not eligible for renewal: Certificate Authority is disabled."
    ],
    [
      "an unexpected error, without passing on its text",
      new Error("relation does not exist"),
      "An unexpected error stopped the certificate from being renewed."
    ]
  ])("tells the requester and approvers when an approved renewal fails at %s", async (_case, error, reason) => {
    const { deps, resource } = setup(() => Promise.resolve());
    deps.certificateRenewalService.renewApprovedCertificate.mockRejectedValue(error);
    const renewalRequest = {
      id: "approval-1",
      organizationId: "org-1",
      requestData: {
        requestData: { certificateRequestId: "cert-req-1", renewal: { certificateId: "cert-1", caId: "ca-1" } }
      }
    } as never;

    await resource.postApprovalRoutine!(renewalRequest);

    expect(deps.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(renewalRequest, reason);
  });

  it("reports no failure when the renewal went through before something after it threw", async () => {
    const { deps, resource } = setup(() => Promise.resolve());
    deps.certificateRenewalService.renewApprovedCertificate.mockRejectedValue(new Error("connection reset"));
    deps.certificateRequestDAL.transitionFromPending.mockResolvedValue(null);
    deps.certificateRequestDAL.findById.mockResolvedValue({
      id: "cert-req-1",
      status: CertificateRequestStatus.ISSUED
    });

    await resource.postApprovalRoutine!({
      id: "approval-1",
      organizationId: "org-1",
      requestData: { requestData: { certificateRequestId: "cert-req-1", renewal: { certificateId: "cert-1" } } }
    } as never);

    expect(deps.certificateRequestDAL.updateById).not.toHaveBeenCalledWith(
      "cert-req-1",
      expect.objectContaining({ status: CertificateRequestStatus.FAILED })
    );
    expect(deps.certificateRequestService.recordIssuanceFailure).not.toHaveBeenCalled();
    expect(deps.approvalPolicyService.notifyApprovedActionFailed).not.toHaveBeenCalled();
  });

  it("reports a failure the issuance already marked on its request before rethrowing", async () => {
    const error = new BadRequestError({ message: "CA is not active" });
    const { deps, failedRequest, resource } = setup(() => Promise.reject(error));
    deps.certificateRequestDAL.transitionFromPending.mockResolvedValue(null);
    deps.certificateRequestDAL.findById.mockResolvedValue(failedRequest);

    await resource.postApprovalRoutine!(request);

    expect(deps.certificateRequestService.recordIssuanceFailure).toHaveBeenCalledWith(failedRequest, { error });
    expect(deps.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(request, "CA is not active.");
  });

  it("names a certificate with no common name by its first subject alternative name", async () => {
    const { resource } = setup(() => Promise.resolve());

    const notification = await resource.buildNotification!({
      event: ApprovalNotificationEvent.ApprovedActionFailed,
      request: {
        id: "approval-1",
        organizationId: "org-1",
        type: "cert-request",
        requestData: {
          requestData: {
            certificateRequestId: "cert-req-1",
            certificateRequest: { altNames: [{ type: "dns_name", value: "api.example.com" }] }
          }
        }
      } as never,
      failureReason: "CA is disabled."
    });

    expect(notification?.inApp?.body).toBe(
      "The approved issuance of the certificate 'api.example.com' didn't complete. Reason: CA is disabled."
    );
  });

  it("words the failure notification for a renewal and names the certificate", async () => {
    const { resource } = setup(() => Promise.resolve());

    const notification = await resource.buildNotification!({
      event: ApprovalNotificationEvent.ApprovedActionFailed,
      request: {
        id: "approval-1",
        organizationId: "org-1",
        type: "cert-request",
        requestData: {
          requestData: {
            certificateRequestId: "cert-req-1",
            renewal: { certificateId: "cert-1" },
            certificateRequest: { commonName: "billing.local" }
          }
        }
      } as never,
      failureReason: "CA is disabled."
    });

    expect(notification?.inApp?.title).toBe("Certificate Renewal Failed");
    expect(notification?.inApp?.body).toBe(
      "The approved renewal of the certificate 'billing.local' didn't complete. Reason: CA is disabled."
    );
    expect(notification?.inApp?.link).toContain("/cert-manager/approvals/approval-1?policyType=cert-request");
  });

  it.each([
    ["automatic renewal", { requesterId: null, machineIdentityId: null }, { raisedByAutoRenewal: true }, true],
    ["a user", { requesterId: "user-1", machineIdentityId: null }, { raisedByAutoRenewal: false }, false],
    ["a user since deleted", { requesterId: null, machineIdentityId: null }, { raisedByAutoRenewal: false }, false],
    [
      "a machine identity",
      { requesterId: null, machineIdentityId: "identity-1" },
      { raisedByAutoRenewal: false },
      false
    ],
    ["no requester before the flag existed", { requesterId: null, machineIdentityId: null }, {}, false],
    ["a user before the flag existed", { requesterId: "user-1", machineIdentityId: null }, {}, false]
  ])("records a rejected renewal raised by %s", async (_by, requester, origin, raisedByAutoRenewal) => {
    const { deps, resource } = setup(() => Promise.resolve());

    await resource.postRejectionRoutine!({
      id: "approval-1",
      ...requester,
      status: ApprovalRequestStatus.Rejected,
      requestData: {
        requestData: { certificateRequestId: "cert-req-1", renewal: { certificateId: "cert-1", ...origin } }
      }
    } as never);

    expect(deps.certificateRenewalService.recordRejectedRenewal).toHaveBeenCalledWith("cert-1", {
      raisedByAutoRenewal
    });
  });

  it("keeps automatic renewal when a renewal request expires", async () => {
    const { deps, resource } = setup(() => Promise.resolve());

    await resource.postRejectionRoutine!({
      id: "approval-1",
      policyId: "policy-1",
      status: ApprovalRequestStatus.Expired,
      requestData: { requestData: { certificateRequestId: "cert-req-1", renewal: { certificateId: "cert-1" } } }
    } as never);

    expect(deps.certificateRenewalService.recordRejectedRenewal).not.toHaveBeenCalled();
  });

  it("keeps automatic renewal when a renewal is cancelled", async () => {
    const { deps, resource } = setup(() => Promise.resolve());

    await resource.postRejectionRoutine!({
      id: "approval-1",
      status: ApprovalRequestStatus.Cancelled,
      requestData: { requestData: { certificateRequestId: "cert-req-1", renewal: { certificateId: "cert-1" } } }
    } as never);

    expect(deps.certificateRenewalService.recordRejectedRenewal).not.toHaveBeenCalled();
  });

  describe("audit of an approved renewal", () => {
    const approvedRenewal = {
      id: "approval-1",
      organizationId: "org-1",
      projectId: "project-1",
      policyId: "policy-1",
      requesterId: "user-1",
      requesterName: "John Smith",
      requesterEmail: "john.smith@example.com",
      requestData: {
        requestData: {
          certificateRequestId: "cert-req-1",
          renewal: { certificateId: "cert-1", renewalKeySource: "new" }
        }
      }
    } as never;

    const renewedResult = {
      status: CertificateRequestStatus.ISSUED,
      originalCertificateId: "cert-1",
      certificateId: "cert-2",
      serialNumber: "0a1b",
      certificateRequestId: "cert-req-1",
      projectId: "project-1",
      profileName: "web-servers",
      commonName: "a.example.com",
      applicationId: "app-1",
      applicationName: "Payments",
      changedAttributes: []
    };

    it("records the renewal Infisical issued, naming the approval request and its requester", async () => {
      const { deps, resource } = setup(() => Promise.resolve());
      deps.certificateRenewalService.renewApprovedCertificate.mockResolvedValue(renewedResult);

      await resource.postApprovalRoutine!(approvedRenewal);

      expect(deps.auditLogService.createAuditLog).toHaveBeenCalledTimes(1);
      expect(deps.auditLogService.createAuditLog.mock.calls[0][0]).toMatchObject({
        projectId: "project-1",
        actor: { type: ActorType.PLATFORM, metadata: {} },
        event: {
          type: EventType.RENEW_CERTIFICATE,
          metadata: {
            originalCertificateId: "cert-1",
            newCertificateId: "cert-2",
            serialNumber: "0a1b",
            certificateRequestId: "cert-req-1",
            commonName: "a.example.com",
            applicationName: "Payments",
            status: CertificateRequestStatus.ISSUED,
            approvalRequestId: "approval-1",
            approvalPolicyName: "prod renewals",
            requesterName: "John Smith",
            requesterEmail: "john.smith@example.com"
          }
        }
      });
    });

    it("names no new certificate while an external CA is still issuing it", async () => {
      const { deps, resource } = setup(() => Promise.resolve());
      deps.certificateRenewalService.renewApprovedCertificate.mockResolvedValue({
        ...renewedResult,
        status: CertificateRequestStatus.PENDING,
        certificateId: "order-1",
        serialNumber: ""
      });

      await resource.postApprovalRoutine!(approvedRenewal);

      const [[{ event }]] = deps.auditLogService.createAuditLog.mock.calls as [[{ event: { metadata: object } }]];
      expect(event.metadata).toMatchObject({
        status: CertificateRequestStatus.PENDING,
        approvalRequestId: "approval-1"
      });
      expect(event.metadata).not.toHaveProperty("newCertificateId");
      expect(event.metadata).not.toHaveProperty("serialNumber");
    });

    it("does not throw when the audit log cannot be written", async () => {
      const { deps, resource } = setup(() => Promise.resolve());
      deps.certificateRenewalService.renewApprovedCertificate.mockResolvedValue(renewedResult);
      deps.auditLogService.createAuditLog.mockRejectedValue(new Error("connection terminated"));

      await expect(resource.postApprovalRoutine!(approvedRenewal)).resolves.toBeUndefined();
      expect(deps.telemetryService.sendPostHogEvents).toHaveBeenCalled();
    });

    it("records no renewal when the approved renewal fails", async () => {
      const { deps, resource } = setup(() => Promise.resolve());
      deps.certificateRenewalService.renewApprovedCertificate.mockRejectedValue(new Error("CA is disabled"));

      await resource.postApprovalRoutine!(approvedRenewal);

      expect(deps.auditLogService.createAuditLog).not.toHaveBeenCalled();
    });
  });

  it("records nothing when issuance succeeds", async () => {
    const { deps, resource } = setup(() => Promise.resolve());

    await resource.postApprovalRoutine!(request);

    expect(deps.certificateRequestService.recordIssuanceFailure).not.toHaveBeenCalled();
  });
});

describe("certRequestApprovalResourceFactory.filterActiveApprovers", () => {
  const applicationRequest = {
    id: "approval-1",
    projectId: "project-1",
    scopeType: ApprovalPolicyScope.PkiApplication,
    scopeId: "app-1"
  } as never;
  const productRequest = { id: "approval-2", projectId: "project-1", scopeType: null, scopeId: null } as never;

  const setup = ({
    memberships,
    roles = [],
    groupLinks = []
  }: {
    memberships: { id: string; actorUserId?: string; actorGroupId?: string; isActive: boolean }[];
    roles?: { membershipId: string; role: string }[];
    groupLinks?: { userId: string; groupId: string }[];
  }) => {
    const deps = {
      approvalPolicyDAL: {
        findByProjectId: vi.fn(),
        findById: vi.fn(),
        primaryNode: vi.fn().mockReturnValue("primary")
      },
      membershipDAL: { find: vi.fn().mockResolvedValue(memberships) },
      membershipRoleDAL: { find: vi.fn().mockResolvedValue(roles) },
      userGroupMembershipDAL: {
        find: vi.fn(async ({ $in }: { $in: { userId: string[]; groupId: string[] } }) =>
          groupLinks.filter((l) => $in.userId.includes(l.userId) && $in.groupId.includes(l.groupId))
        )
      }
    };
    return { deps, resource: certRequestApprovalResourceFactory(deps as never) };
  };

  it("drops approvers who are no longer in the Application, and keeps any role, directly or through a group", async () => {
    const { deps, resource } = setup({
      memberships: [
        { id: "m-admin", actorUserId: "admin", isActive: true },
        { id: "m-auditor", actorUserId: "auditor", isActive: true },
        { id: "m-deactivated", actorUserId: "deactivated", isActive: false },
        { id: "m-group", actorGroupId: "group-in-app", isActive: true }
      ],
      groupLinks: [{ userId: "via-group", groupId: "group-in-app" }]
    });

    const live = await resource.filterActiveApprovers!(applicationRequest, [
      { type: ApproverType.User, id: "admin" },
      { type: ApproverType.User, id: "auditor" },
      { type: ApproverType.User, id: "removed" },
      { type: ApproverType.User, id: "deactivated" },
      { type: ApproverType.User, id: "via-group" },
      { type: ApproverType.Group, id: "group-in-app" },
      { type: ApproverType.Group, id: "group-removed" }
    ]);

    expect(live).toEqual([
      { type: ApproverType.User, id: "admin" },
      { type: ApproverType.User, id: "auditor" },
      { type: ApproverType.User, id: "via-group" },
      { type: ApproverType.Group, id: "group-in-app" }
    ]);
    expect(deps.membershipDAL.find).toHaveBeenCalledWith(
      expect.objectContaining({ scopeResourceId: "app-1", scopeProjectId: "project-1" }),
      { tx: "primary" }
    );
    expect(deps.membershipRoleDAL.find, "any Application role counts").not.toHaveBeenCalled();
  });

  it("judges a policy without an Application by Certificate Management membership, where No Access doesn't count", async () => {
    const { resource } = setup({
      memberships: [
        { id: "m-member", actorUserId: "member", isActive: true },
        { id: "m-no-access", actorUserId: "no-access", isActive: true }
      ],
      roles: [
        { membershipId: "m-member", role: ProjectMembershipRole.Member },
        { membershipId: "m-no-access", role: ProjectMembershipRole.NoAccess }
      ]
    });

    const live = await resource.filterActiveApprovers!(productRequest, [
      { type: ApproverType.User, id: "member" },
      { type: ApproverType.User, id: "no-access" },
      { type: ApproverType.User, id: "removed" }
    ]);

    expect(live).toEqual([{ type: ApproverType.User, id: "member" }]);
  });

  it("notifies nobody saved on the request once no one is left in the Application", async () => {
    const { resource } = setup({ memberships: [] });

    expect(
      await resource.filterActiveApprovers!(applicationRequest, [{ type: ApproverType.User, id: "removed" }])
    ).toEqual([]);
  });
});
