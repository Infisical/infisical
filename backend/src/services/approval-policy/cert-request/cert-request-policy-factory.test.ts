import { describe, expect, it, vi } from "vitest";

import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { ApprovalRequestStatus } from "../approval-policy-enums";
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
      approvalPolicyDAL: { findByProjectId: vi.fn() },
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

  it("stops automatic renewal when a renewal is rejected", async () => {
    const { deps, resource } = setup(() => Promise.resolve());

    await resource.postRejectionRoutine!({
      id: "approval-1",
      status: ApprovalRequestStatus.Rejected,
      requestData: { requestData: { certificateRequestId: "cert-req-1", renewal: { certificateId: "cert-1" } } }
    } as never);

    expect(deps.certificateRenewalService.recordRejectedRenewal).toHaveBeenCalledWith("cert-1");
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

  it("records nothing when issuance succeeds", async () => {
    const { deps, resource } = setup(() => Promise.resolve());

    await resource.postApprovalRoutine!(request);

    expect(deps.certificateRequestService.recordIssuanceFailure).not.toHaveBeenCalled();
  });
});
