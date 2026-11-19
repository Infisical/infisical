import { getConfig } from "@app/lib/config/env";
import { getCertificateDisplayName } from "@app/services/certificate/certificate-fns";
import { TCertificateServiceFactory } from "@app/services/certificate/certificate-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { SmtpTemplates } from "@app/services/smtp/smtp-service";

import { ApprovalNotificationEvent, ApprovalPolicyType } from "../approval-policy-enums";
import { TApprovalResource } from "../approval-policy-types";
import { applicationApproverChecksFactory, TApplicationApproverChecksDep } from "./application-approver-checks";
import {
  TCertRevocationPolicy,
  TCertRevocationPolicyInputs,
  TCertRevocationRequestData
} from "./cert-revocation-policy-types";

type TCertRevocationApprovalResourceDep = TApplicationApproverChecksDep & {
  certificateService: Pick<TCertificateServiceFactory, "revokeApprovedCertificate">;
};

export const certRevocationApprovalResourceFactory = ({
  certificateService,
  ...approverCheckDeps
}: TCertRevocationApprovalResourceDep): TApprovalResource<
  TCertRevocationPolicyInputs,
  TCertRevocationPolicy,
  TCertRevocationRequestData
> => ({
  ...applicationApproverChecksFactory<TCertRevocationPolicy>(approverCheckDeps, {
    policyType: ApprovalPolicyType.CertRevocation,
    policyLabel: "Revocation"
  }),

  // Notifications name the certificate and, on failure, why.
  buildNotification: async ({ event, request, failureReason }) => {
    const certificateName = getCertificateDisplayName(
      (request.requestData as { requestData: TCertRevocationRequestData }).requestData
    );
    const cfg = getConfig();
    const approvalUrl = `${cfg.SITE_URL}/organizations/${request.organizationId}/cert-manager/approvals/${request.id}?policyType=${encodeURIComponent(request.type)}&from=root-requests`;

    if (event === ApprovalNotificationEvent.ApprovedActionFailed) {
      return {
        inApp: {
          type: NotificationType.APPROVED_ACTION_FAILED,
          title: "Certificate Revocation Failed",
          body: `The approved revocation of the certificate '${certificateName}' didn't complete. Reason: ${failureReason}`,
          link: approvalUrl
        }
      };
    }

    if (event !== ApprovalNotificationEvent.Requested) return null;

    return {
      inApp: {
        type: NotificationType.APPROVAL_REQUIRED,
        title: "Approval Required",
        body: `${request.requesterName} asked to revoke the certificate '${certificateName}'.`,
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

  postApprovalRoutine: async (request) => {
    await certificateService.revokeApprovedCertificate(request);
  }
});
