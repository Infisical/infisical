import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { CertificateIssuanceOperation } from "@app/services/certificate-common/certificate-constants";
import { describeCaOperationFailure } from "@app/services/certificate-common/certificate-failure-fns";
import { TCertificateRequestDALFactory } from "@app/services/certificate-request/certificate-request-dal";
import { TCertificateRequestServiceFactory } from "@app/services/certificate-request/certificate-request-service";
import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";
import { TCertificateApprovalService } from "@app/services/certificate-v3/certificate-approval-fns";
import { TCertificateRenewalServiceFactory } from "@app/services/certificate-v3/certificate-renewal-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { SmtpTemplates } from "@app/services/smtp/smtp-service";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { TApprovalPolicyDALFactory } from "../approval-policy-dal";
import {
  ApprovalAuditAction,
  ApprovalNotificationEvent,
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApprovalRequestStatus
} from "../approval-policy-enums";
import { TApprovalPolicyServiceFactory } from "../approval-policy-service";
import { TApprovalResource } from "../approval-policy-types";
import { TCertRequestPolicy, TCertRequestPolicyInputs, TCertRequestRequestData } from "./cert-request-policy-types";

type TCertRequestApprovalResourceDep = {
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findByProjectId">;
  approvalPolicyService: Pick<TApprovalPolicyServiceFactory, "notifyApprovedActionFailed">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  certificateApprovalService: TCertificateApprovalService;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  certificateRequestDAL: Pick<TCertificateRequestDALFactory, "updateById" | "findById">;
  certificateRequestService: Pick<TCertificateRequestServiceFactory, "recordIssuanceFailure">;
  certificateRenewalService: Pick<
    TCertificateRenewalServiceFactory,
    "renewApprovedCertificate" | "recordRejectedRenewal"
  >;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
};

export const certRequestApprovalResourceFactory = ({
  approvalPolicyDAL,
  approvalPolicyService,
  auditLogService,
  certificateApprovalService,
  certificateAuthorityDAL,
  certificateRequestDAL,
  certificateRequestService,
  certificateRenewalService,
  telemetryService
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

  // Cert approvals notify approvers when raised, and everyone when the approved action then fails.
  buildNotification: async ({ event, request, failureReason }) => {
    if (event === ApprovalNotificationEvent.ApprovedActionFailed) {
      const { renewal, certificateRequest } = (request.requestData as { requestData: TCertRequestRequestData })
        .requestData;
      const action = renewal ? "renewal" : "issuance";
      const certificate = certificateRequest?.commonName
        ? ` of the certificate '${certificateRequest.commonName}'`
        : "";
      return {
        inApp: {
          type: NotificationType.APPROVED_ACTION_FAILED,
          title: renewal ? "Certificate Renewal Failed" : "Certificate Issuance Failed",
          body: `The approved ${action}${certificate} didn't complete. Reason: ${failureReason}`,
          link: `${getConfig().SITE_URL}/organizations/${request.organizationId}/cert-manager/approvals/${request.id}?policyType=${encodeURIComponent(request.type)}&from=root-requests`
        }
      };
    }

    if (event !== ApprovalNotificationEvent.Requested) return null;

    const cfg = getConfig();
    const approvalUrl = `${cfg.SITE_URL}/organizations/${request.organizationId}/cert-manager/approvals/${request.id}?policyType=${encodeURIComponent(request.type)}&from=root-requests`;

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
    const {
      certificateRequestId: certReqId,
      renewal,
      certificateRequest: reviewedCertificateRequest
    } = request.requestData.requestData as TCertRequestRequestData;

    await certificateRequestDAL.updateById(certReqId, {
      status: CertificateRequestStatus.PENDING,
      approvalRequestId: request.id
    });

    let renewed: Awaited<ReturnType<typeof certificateRenewalService.renewApprovedCertificate>> | undefined;
    try {
      if (renewal) {
        renewed = await certificateRenewalService.renewApprovedCertificate({
          certificateRequestId: certReqId,
          organizationId: request.organizationId,
          renewal,
          reviewedCertificateRequest
        });
      } else {
        await certificateApprovalService.issueCertificate(certReqId);
      }
      logger.info(
        { certificateRequestId: certReqId, approvalRequestId: request.id },
        `Certificate issued after approval [certificateRequestId=${certReqId}]`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const failedRequest = await certificateRequestDAL.updateById(certReqId, {
        status: CertificateRequestStatus.FAILED,
        errorMessage
      });
      await certificateRequestService.recordIssuanceFailure(failedRequest, {
        error,
        ...(renewal && {
          operation: CertificateIssuanceOperation.RENEW,
          originalCertificateId: renewal.certificateId
        })
      });
      const caId = failedRequest?.caId ?? renewal?.caId;
      const ca = caId ? await certificateAuthorityDAL.findByIdWithAssociatedCa(caId).catch(() => undefined) : undefined;
      await approvalPolicyService.notifyApprovedActionFailed(
        request,
        describeCaOperationFailure({
          action: renewal ? "Renewing the certificate" : "Issuing the certificate",
          ca,
          error,
          fallback: "An unexpected error stopped the certificate from being issued."
        })
      );
      logger.error(
        { error, certificateRequestId: certReqId, approvalRequestId: request.id },
        `Failed to issue certificate after approval [certificateRequestId=${certReqId}]`
      );
      return;
    }

    if (renewal && renewed) {
      // The approval has already committed, so a failed audit write must not surface to the approver.
      try {
        // An external-CA renewal still pending returns its order id in certificateId, not a certificate.
        const isIssued = renewed.status === CertificateRequestStatus.ISSUED;
        await auditLogService.createAuditLog({
          projectId: request.projectId,
          actor: { type: ActorType.PLATFORM, metadata: {} },
          event: {
            type: EventType.RENEW_CERTIFICATE,
            metadata: {
              originalCertificateId: renewed.originalCertificateId,
              ...(isIssued && { newCertificateId: renewed.certificateId, serialNumber: renewed.serialNumber }),
              certificateRequestId: renewed.certificateRequestId,
              profileName: renewed.profileName,
              commonName: renewed.commonName || "",
              applicationId: renewed.applicationId,
              applicationName: renewed.applicationName,
              renewalKeySource: renewal.renewalKeySource,
              externalConfiguration: renewal.externalConfiguration,
              changedAttributes: renewed.changedAttributes ?? [],
              status: renewed.status,
              approvalRequestId: request.id,
              requesterName: request.requesterName,
              requesterEmail: request.requesterEmail
            }
          }
        });
      } catch (error) {
        logger.error(
          error,
          `Failed to record an approved certificate renewal [certificateRequestId=${certReqId}] [approvalRequestId=${request.id}]`
        );
      }
    }

    const requesterDistinctId = request.machineIdentityId
      ? `identity-${request.machineIdentityId}`
      : request.requesterId && request.requesterEmail;
    if (renewal && requesterDistinctId) {
      await telemetryService.sendPostHogEvents({
        event: PostHogEventTypes.CertificateRenewed,
        distinctId: requesterDistinctId,
        organizationId: request.organizationId,
        properties: { orgId: request.organizationId, projectId: request.projectId }
      });
    }
  },

  postRejectionRoutine: async (request) => {
    const { certificateRequestId: certReqId, renewal } = request.requestData.requestData as TCertRequestRequestData;
    await certificateRequestDAL.updateById(certReqId, {
      status: CertificateRequestStatus.REJECTED,
      approvalRequestId: request.id
    });
    if (renewal && request.status === ApprovalRequestStatus.Rejected) {
      // A rejected request the daily job raised would otherwise be raised again the next day. Requests raised
      // before the flag existed fall back to having no requester, which a deleted requester also matches.
      await certificateRenewalService.recordRejectedRenewal(renewal.certificateId, {
        raisedByAutoRenewal: renewal.raisedByAutoRenewal ?? (!request.requesterId && !request.machineIdentityId)
      });
    }
  }
});
