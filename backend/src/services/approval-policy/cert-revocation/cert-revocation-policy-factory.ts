import { getConfig } from "@app/lib/config/env";
import { TCertificateServiceFactory } from "@app/services/certificate/certificate-service";
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
import {
  TCertRevocationPolicy,
  TCertRevocationPolicyInputs,
  TCertRevocationRequestData
} from "./cert-revocation-policy-types";

type TCertRevocationApprovalResourceDep = {
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findByProjectId">;
  certificateService: Pick<TCertificateServiceFactory, "revokeApprovedCertificate">;
};

export const certRevocationApprovalResourceFactory = ({
  approvalPolicyDAL,
  certificateService
}: TCertRevocationApprovalResourceDep): TApprovalResource<
  TCertRevocationPolicyInputs,
  TCertRevocationPolicy,
  TCertRevocationRequestData
> => ({
  scopeType: ApprovalPolicyScope.PkiApplication,

  matchPolicy: async (projectId, inputs) => {
    const policies = (await approvalPolicyDAL.findByProjectId(ApprovalPolicyType.CertRevocation, projectId, {
      scopeType: ApprovalPolicyScope.PkiApplication,
      scopeId: inputs.applicationId
    })) as TCertRevocationPolicy[];

    return (
      policies.find(
        (p) => p.isActive && p.conditions.conditions.some((c) => c.profileNames.includes(inputs.profileName))
      ) ?? null
    );
  },

  // An approved revocation revokes the certificate rather than leaving a standing grant behind.
  canAccess: async () => null,

  validateConstraints: () => ({ valid: true }),

  buildNotification: async ({ event, request, failureReason }) => {
    const { commonName } = (request.requestData as { requestData: TCertRevocationRequestData }).requestData;
    const cfg = getConfig();
    const approvalUrl = `${cfg.SITE_URL}/organizations/${request.organizationId}/cert-manager/approvals/${request.id}?policyType=${encodeURIComponent(request.type)}&from=root-requests`;

    if (event === ApprovalNotificationEvent.ApprovedActionFailed) {
      return {
        inApp: {
          type: NotificationType.APPROVED_ACTION_FAILED,
          title: "Certificate Revocation Failed",
          body: `The approved revocation of the certificate '${commonName}' didn't complete. Reason: ${failureReason}`,
          link: approvalUrl
        }
      };
    }

    if (event !== ApprovalNotificationEvent.Requested) return null;

    return {
      inApp: {
        type: NotificationType.APPROVAL_REQUIRED,
        title: "Approval Required",
        body: `${request.requesterName} asked to revoke the certificate '${commonName}'.`,
        link: approvalUrl
      },
      email: cfg.SITE_URL
        ? {
            subjectLine: "Certificate Revocation Request",
            template: SmtpTemplates.PkiApprovalRequestNeedsReview,
            substitutions: {
              requesterName: request.requesterName,
              requesterEmail: request.requesterEmail || undefined,
              title: "Certificate Revocation Request",
              requestType: "certificate revocation request",
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
    await certificateService.revokeApprovedCertificate(request);
  }
});
