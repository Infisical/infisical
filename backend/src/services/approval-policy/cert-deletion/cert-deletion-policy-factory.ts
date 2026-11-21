import { getConfig } from "@app/lib/config/env";
import { getCertificateDisplayName } from "@app/services/certificate/certificate-fns";
import { TCertificateServiceFactory } from "@app/services/certificate/certificate-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { SmtpTemplates } from "@app/services/smtp/smtp-service";

import { ApprovalNotificationEvent, ApprovalPolicyType } from "../approval-policy-enums";
import { TApprovalResource } from "../approval-policy-types";
import {
  applicationApproverChecksFactory,
  TApplicationApproverChecksDep
} from "../cert-revocation/application-approver-checks";
import { TCertDeletionPolicy, TCertDeletionPolicyInputs, TCertDeletionRequestData } from "./cert-deletion-policy-types";

type TCertDeletionApprovalResourceDep = TApplicationApproverChecksDep & {
  certificateService: Pick<TCertificateServiceFactory, "deleteApprovedCertificate">;
};

export const certDeletionApprovalResourceFactory = ({
  certificateService,
  ...approverCheckDeps
}: TCertDeletionApprovalResourceDep): TApprovalResource<
  TCertDeletionPolicyInputs,
  TCertDeletionPolicy,
  TCertDeletionRequestData
> => ({
  ...applicationApproverChecksFactory<TCertDeletionPolicy>(approverCheckDeps, {
    policyType: ApprovalPolicyType.CertDeletion,
    policyLabel: "Deletion"
  }),

  buildNotification: async ({ event, request, failureReason }) => {
    const certificateName = getCertificateDisplayName(
      (request.requestData as { requestData: TCertDeletionRequestData }).requestData
    );
    const cfg = getConfig();
    const approvalUrl = `${cfg.SITE_URL}/organizations/${request.organizationId}/cert-manager/approvals/${request.id}?policyType=${encodeURIComponent(request.type)}&from=root-requests`;

    if (event === ApprovalNotificationEvent.ApprovedActionFailed) {
      return {
        inApp: {
          type: NotificationType.APPROVED_ACTION_FAILED,
          title: "Certificate Deletion Failed",
          body: `The approved deletion of the certificate '${certificateName}' didn't complete. Reason: ${failureReason}`,
          link: approvalUrl
        }
      };
    }

    if (event !== ApprovalNotificationEvent.Requested) return null;

    return {
      inApp: {
        type: NotificationType.APPROVAL_REQUIRED,
        title: "Approval Required",
        body: `${request.requesterName} asked to delete the certificate '${certificateName}'.`,
        link: approvalUrl
      },
      email: cfg.SITE_URL
        ? {
            subjectLine: "Certificate Deletion Request",
            template: SmtpTemplates.PkiApprovalRequestNeedsReview,
            substitutions: {
              requesterName: request.requesterName,
              requesterEmail: request.requesterEmail || undefined,
              title: "Certificate Deletion Request",
              requestType: "certificate deletion request",
              justification: request.justification || undefined,
              approvalUrl
            }
          }
        : undefined
    };
  },

  postApprovalRoutine: async (request) => {
    await certificateService.deleteApprovedCertificate(request);
  }
});
