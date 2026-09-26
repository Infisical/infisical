import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { TCertificateRequestDALFactory } from "@app/services/certificate-request/certificate-request-dal";
import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";
import { TCertificateApprovalService } from "@app/services/certificate-v3/certificate-approval-fns";
import { NotificationType } from "@app/services/notification/notification-types";
import { SmtpTemplates } from "@app/services/smtp/smtp-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { TApprovalPolicyDALFactory } from "../approval-policy-dal";
import {
  ApprovalAuditAction,
  ApprovalNotificationEvent,
  ApprovalPolicyScope,
  ApprovalPolicyType
} from "../approval-policy-enums";
import { TApprovalResource } from "../approval-policy-types";
import { TCertRequestPolicy, TCertRequestPolicyInputs, TCertRequestRequestData } from "./cert-request-policy-types";

type TCertRequestApprovalResourceDep = {
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findByProjectId">;
  certificateApprovalService: TCertificateApprovalService;
  certificateRequestDAL: Pick<TCertificateRequestDALFactory, "updateById" | "findById">;
};

export const certRequestApprovalResourceFactory = ({
  approvalPolicyDAL,
  certificateApprovalService,
  certificateRequestDAL
}: TCertRequestApprovalResourceDep): TApprovalResource<
  TCertRequestPolicyInputs,
  TCertRequestPolicy,
  TCertRequestRequestData
> => ({
  matchPolicy: async (projectId, inputs) => {
    const policies = await approvalPolicyDAL.findByProjectId(ApprovalPolicyType.CertRequest, projectId);

    const inputAppId = inputs.applicationId ?? null;
    const expectedScopeType = inputAppId ? ApprovalPolicyScope.PkiApplication : null;
    const candidates = (policies as TCertRequestPolicy[]).filter(
      (p) => p.isActive && (p.scopeType ?? null) === expectedScopeType && (p.scopeId ?? null) === inputAppId
    );

    return (
      candidates.find((p) => p.conditions.conditions.some((c) => c.profileNames.includes(inputs.profileName))) ?? null
    );
  },

  // Certificate approvals issue a certificate rather than leaving a standing grant behind.
  canAccess: async () => null,

  validateConstraints: () => ({ valid: true }),

  // Cert approvals notify approvers when raised; the decision shows up on the certificate itself.
  buildNotification: async ({ event, request }) => {
    if (event !== ApprovalNotificationEvent.Requested) return null;

    const cfg = getConfig();
    const approvalUrl = `${cfg.SITE_URL}/organizations/${request.organizationId}/projects/cert-manager/${request.projectId}/approvals/${request.id}?policyType=${encodeURIComponent(request.type)}&from=root-requests`;

    return {
      inApp: {
        type: NotificationType.APPROVAL_REQUIRED,
        title: "Approval Required",
        body: `You have a new approval request for ${request.type} from ${request.requesterName}.`,
        link: approvalUrl
      },
      email: cfg.SITE_URL
        ? {
            subjectLine: "Certificate Approval Request",
            template: SmtpTemplates.PkiApprovalRequestNeedsReview,
            substitutions: {
              requesterName: request.requesterName,
              requesterEmail: request.requesterEmail || undefined,
              title: "Certificate Approval Request",
              requestType: "certificate request",
              justification: request.justification || undefined,
              approvalUrl
            }
          }
        : undefined
    };
  },

  buildTelemetryEvent: async ({ action, request, distinctId, decision }) =>
    action === ApprovalAuditAction.RequestReviewed
      ? {
          event: PostHogEventTypes.PkiApprovalRequestReviewed,
          distinctId,
          organizationId: request.organizationId,
          properties: { decision: decision ?? "", orgId: request.organizationId, projectId: request.projectId }
        }
      : null,

  postApprovalRoutine: async (request) => {
    const certReqId = (request.requestData.requestData as TCertRequestRequestData).certificateRequestId;

    await certificateRequestDAL.updateById(certReqId, {
      status: CertificateRequestStatus.PENDING,
      approvalRequestId: request.id
    });

    try {
      await certificateApprovalService.issueCertificate(certReqId);
      logger.info(
        { certificateRequestId: certReqId, approvalRequestId: request.id },
        `Certificate issued after approval [certificateRequestId=${certReqId}]`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await certificateRequestDAL.updateById(certReqId, {
        status: CertificateRequestStatus.FAILED,
        errorMessage
      });
      logger.error(
        { error, certificateRequestId: certReqId, approvalRequestId: request.id },
        `Failed to issue certificate after approval [certificateRequestId=${certReqId}]`
      );
    }
  },

  postRejectionRoutine: async (request) => {
    const certReqId = (request.requestData.requestData as TCertRequestRequestData).certificateRequestId;
    await certificateRequestDAL.updateById(certReqId, {
      status: CertificateRequestStatus.REJECTED,
      approvalRequestId: request.id
    });
  }
});
