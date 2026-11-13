import { describe, expect, it, vi } from "vitest";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ActorType } from "@app/services/auth/auth-type";
import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { ApprovalRequestStatus, CertRequestRenewalApproval } from "../approval-policy-enums";
import { certRequestApprovalResourceFactory } from "./cert-request-policy-factory";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

describe("certRequestApprovalResourceFactory.postApprovalRoutine", () => {
  const request = {
    id: "approval-1",
    requestData: { requestData: { certificateRequestId: "cert-req-1" } }
  } as never;

  const setup = (issueCertificate: () => Promise<unknown>) => {
    const failedRequest = { id: "cert-req-1", status: CertificateRequestStatus.FAILED };
    const deps = {
      approvalPolicyDAL: { findByProjectId: vi.fn(), findById: vi.fn().mockResolvedValue(undefined) },
      auditLogService: { createAuditLog: vi.fn().mockResolvedValue(undefined) },
      certificateApprovalService: { issueCertificate: vi.fn(issueCertificate) },
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
      { version: 1, constraints: { renewalApproval: CertRequestRenewalApproval.Always } },
      CertRequestRenewalApproval.Always
    ],
    [
      { version: 1, constraints: { renewalApproval: CertRequestRenewalApproval.OnChange } },
      CertRequestRenewalApproval.OnChange
    ],
    [{ version: 1, constraints: {} }, CertRequestRenewalApproval.OnChange]
  ])("records a rejected renewal under the policy's renewal setting %j", async (constraints, renewalApproval) => {
    const { deps, resource } = setup(() => Promise.resolve());
    deps.approvalPolicyDAL.findById.mockResolvedValue({ id: "policy-1", constraints });

    await resource.postRejectionRoutine!({
      id: "approval-1",
      policyId: "policy-1",
      status: ApprovalRequestStatus.Rejected,
      requestData: { requestData: { certificateRequestId: "cert-req-1", renewal: { certificateId: "cert-1" } } }
    } as never);

    expect(deps.certificateRenewalService.recordRejectedRenewal).toHaveBeenCalledWith("cert-1", renewalApproval);
  });

  it("keeps automatic renewal when a renewal request expires", async () => {
    const { deps, resource } = setup(() => Promise.resolve());
    deps.approvalPolicyDAL.findById.mockResolvedValue({
      id: "policy-1",
      constraints: { version: 1, constraints: { renewalApproval: CertRequestRenewalApproval.Always } }
    });

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
