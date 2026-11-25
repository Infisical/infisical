import { getConfig } from "@app/lib/config/env";
import { getCertificateDisplayName } from "@app/services/certificate/certificate-fns";
import { NotificationType } from "@app/services/notification/notification-types";
import { SmtpTemplates } from "@app/services/smtp/smtp-service";

import { ApprovalNotificationEvent } from "../approval-policy-enums";
import { TApprovalResource } from "../approval-policy-types";
import { CERTIFICATE_ACTIONS, TCertificateActionPolicyType } from "./certificate-action-policy-fns";

type TNamedCertificate = Parameters<typeof getCertificateDisplayName>[0];

export const buildCertificateActionNotification =
  (policyType: TCertificateActionPolicyType): NonNullable<TApprovalResource["buildNotification"]> =>
  async ({ event, request, failureReason }) => {
    const { label, noun, verb } = CERTIFICATE_ACTIONS[policyType];
    const certificateName = getCertificateDisplayName(
      (request.requestData as { requestData: TNamedCertificate }).requestData
    );
    const cfg = getConfig();
    const approvalUrl = `${cfg.SITE_URL}/organizations/${request.organizationId}/cert-manager/approvals/${request.id}?policyType=${encodeURIComponent(request.type)}&from=root-requests`;

    if (event === ApprovalNotificationEvent.ApprovedActionFailed) {
      return {
        inApp: {
          type: NotificationType.APPROVED_ACTION_FAILED,
          title: `Certificate ${label} Failed`,
          body: `The approved ${noun} of the certificate '${certificateName}' didn't complete. Reason: ${failureReason}`,
          link: approvalUrl
        }
      };
    }

    if (event !== ApprovalNotificationEvent.Requested) return null;

    return {
      inApp: {
        type: NotificationType.APPROVAL_REQUIRED,
        title: "Approval Required",
        body: `${request.requesterName} asked to ${verb} the certificate '${certificateName}'.`,
        link: approvalUrl
      },
      email: cfg.SITE_URL
        ? {
            subjectLine: `Certificate ${label} Request`,
            template: SmtpTemplates.PkiApprovalRequestNeedsReview,
            substitutions: {
              requesterName: request.requesterName,
              requesterEmail: request.requesterEmail || undefined,
              title: `Certificate ${label} Request`,
              requestType: `certificate ${noun} request`,
              justification: request.justification || undefined,
              approvalUrl
            }
          }
        : undefined
    };
  };
