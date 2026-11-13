import { describe, expect, it, vi } from "vitest";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { ApprovalNotificationEvent, ApprovalRequestStatus } from "../approval-policy-enums";
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
      approvalPolicyDAL: { findByProjectId: vi.fn() },
      approvalPolicyService: { notifyApprovedActionFailed: vi.fn().mockResolvedValue(undefined) },
      auditLogService: { createAuditLog: vi.fn().mockResolvedValue(undefined) },
      certificateApprovalService: { issueCertificate: vi.fn(issueCertificate) },
      certificateAuthorityDAL: {
        findByIdWithAssociatedCa: vi.fn().mockResolvedValue({ name: "root-ca", externalCa: null })
      },
      certificateRequestDAL: { updateById: vi.fn().mockResolvedValue(failedRequest), findById: vi.fn() },
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

    expect(deps.certificateRequestDAL.updateById).toHaveBeenLastCalledWith("cert-req-1", {
      status: CertificateRequestStatus.FAILED,
      errorMessage: "CA is disabled"
    });
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
      "an internal CA",
      { name: "root-ca", externalCa: null },
      "Certificate Authority is disabled, must be active",
      "Renewing the certificate at CA 'root-ca' failed: Certificate Authority is disabled, must be active."
    ],
    [
      "an external CA behind an unreachable gateway",
      { name: "e2e-adcs-ca", externalCa: { type: CaType.ADCS } },
      "Unable to connect to gateway, no platform connection details found",
      "Renewing the certificate at CA 'e2e-adcs-ca' (Microsoft ADCS) failed: Unable to connect to gateway, no platform connection details found."
    ]
  ])("tells the requester and approvers when an approved renewal fails at %s", async (_ca, ca, message, reason) => {
    const { deps, resource } = setup(() => Promise.resolve());
    deps.certificateAuthorityDAL.findByIdWithAssociatedCa.mockResolvedValue(ca);
    deps.certificateRenewalService.renewApprovedCertificate.mockRejectedValue(new BadRequestError({ message }));
    const renewalRequest = {
      id: "approval-1",
      organizationId: "org-1",
      requestData: {
        requestData: { certificateRequestId: "cert-req-1", renewal: { certificateId: "cert-1", caId: "ca-1" } }
      }
    } as never;

    await resource.postApprovalRoutine!(renewalRequest);

    expect(deps.certificateAuthorityDAL.findByIdWithAssociatedCa).toHaveBeenCalledWith("ca-1");
    expect(deps.approvalPolicyService.notifyApprovedActionFailed).toHaveBeenCalledWith(renewalRequest, reason);
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
    ["automatic renewal", { requesterId: null, machineIdentityId: null }, true],
    ["a user", { requesterId: "user-1", machineIdentityId: null }, false],
    ["a machine identity", { requesterId: null, machineIdentityId: "identity-1" }, false]
  ])("records a rejected renewal raised by %s", async (_by, requester, raisedByAutoRenewal) => {
    const { deps, resource } = setup(() => Promise.resolve());

    await resource.postRejectionRoutine!({
      id: "approval-1",
      ...requester,
      status: ApprovalRequestStatus.Rejected,
      requestData: { requestData: { certificateRequestId: "cert-req-1", renewal: { certificateId: "cert-1" } } }
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
