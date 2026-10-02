import { getConfig } from "@app/lib/config/env";
import { ms } from "@app/lib/ms";
import { NotificationType } from "@app/services/notification/notification-types";
import { SmtpTemplates } from "@app/services/smtp/smtp-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { TApprovalPolicyDALFactory } from "../approval-policy-dal";
import {
  ApprovalAuditAction,
  ApprovalNotificationEvent,
  ApprovalPolicyType,
  ApprovalRequestGrantStatus
} from "../approval-policy-enums";
import { TApprovalResource } from "../approval-policy-types";
import { TApprovalRequestGrantsDALFactory } from "../approval-request-dal";
import { normalizeCodeSigningScope } from "./code-signing-policy-fns";
import {
  TCodeSigningGrantAttributes,
  TCodeSigningPolicy,
  TCodeSigningPolicyInputs,
  TCodeSigningRequestData
} from "./code-signing-policy-types";

type TCodeSigningApprovalResourceDep = {
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findByProjectId">;
  approvalRequestGrantsDAL: Pick<TApprovalRequestGrantsDALFactory, "find" | "create">;
};

export const codeSigningApprovalResourceFactory = ({
  approvalPolicyDAL,
  approvalRequestGrantsDAL
}: TCodeSigningApprovalResourceDep): TApprovalResource<
  TCodeSigningPolicyInputs,
  TCodeSigningPolicy,
  TCodeSigningRequestData
> => ({
  matchPolicy: async (projectId, inputs) => {
    const policies = await approvalPolicyDAL.findByProjectId(ApprovalPolicyType.CertCodeSigning, projectId);
    const policy = policies.find((p) => p.id === inputs.approvalPolicyId) as TCodeSigningPolicy | undefined;

    return policy?.isActive ? policy : null;
  },

  canAccess: async (projectId, actorId, inputs) => {
    const [userGrants, identityGrants] = await Promise.all([
      approvalRequestGrantsDAL.find({
        granteeUserId: actorId,
        type: ApprovalPolicyType.CertCodeSigning,
        status: ApprovalRequestGrantStatus.Active,
        projectId,
        revokedAt: null
      }),
      approvalRequestGrantsDAL.find({
        granteeMachineIdentityId: actorId,
        type: ApprovalPolicyType.CertCodeSigning,
        status: ApprovalRequestGrantStatus.Active,
        projectId,
        revokedAt: null
      })
    ]);

    const now = new Date();

    return (
      [...userGrants, ...identityGrants].find((grant) => {
        const attributes = grant.attributes as TCodeSigningGrantAttributes | null;
        if (!attributes || attributes.signerId !== inputs.signerId) return false;
        if (attributes.windowStart && new Date(attributes.windowStart) > now) return false;
        if (grant.expiresAt && new Date(grant.expiresAt) < now) return false;
        return true;
      }) ?? null
    );
  },

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
            subjectLine: "Code Signing Approval Request",
            template: SmtpTemplates.PkiApprovalRequestNeedsReview,
            substitutions: {
              requesterName: request.requesterName,
              requesterEmail: request.requesterEmail || undefined,
              title: "Code Signing Approval Request",
              requestType: "code signing request",
              justification: request.justification || undefined,
              approvalUrl
            }
          }
        : undefined
    };
  },

  validateConstraints: (policy, inputs) => {
    const errors: string[] = [];
    const { maxWindowDuration, maxSignings } = policy.constraints.constraints;

    if (maxWindowDuration && !inputs.requestedWindowDuration) {
      errors.push(`This policy caps the signing window at ${maxWindowDuration}, so a request must ask for one`);
    } else if (
      maxWindowDuration &&
      inputs.requestedWindowDuration &&
      ms(inputs.requestedWindowDuration) > ms(maxWindowDuration)
    ) {
      errors.push(`Requested window duration exceeds maximum of ${maxWindowDuration}`);
    }

    if (maxSignings && !inputs.requestedSignings) {
      errors.push(`This policy caps signatures per approval at ${maxSignings}, so a request must ask for a count`);
    } else if (maxSignings && inputs.requestedSignings && inputs.requestedSignings > maxSignings) {
      errors.push(`Requested signings (${inputs.requestedSignings}) exceeds maximum of ${maxSignings}`);
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
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

  postApprovalTxRoutine: async (request, tx) => {
    const requestData = request.requestData.requestData as TCodeSigningRequestData & {
      requestedWindowStart?: string;
      requestedWindowEnd?: string;
    };

    const grantAttributes: TCodeSigningGrantAttributes = {
      signerId: requestData.signerId,
      signerName: requestData.signerName
    };

    let expiresAt: Date | undefined;

    if (requestData.requestedSignings) {
      grantAttributes.maxSignings = requestData.requestedSignings;
    }

    if (requestData.requestedWindowDuration) {
      const windowStart = new Date();
      grantAttributes.windowStart = windowStart.toISOString();
      expiresAt = new Date(windowStart.getTime() + ms(requestData.requestedWindowDuration));
    } else if (requestData.requestedWindowEnd) {
      grantAttributes.windowStart = requestData.requestedWindowStart ?? new Date().toISOString();
      expiresAt = new Date(requestData.requestedWindowEnd);
    }

    const scope = normalizeCodeSigningScope(requestData.scope);
    if (scope) {
      grantAttributes.scope = scope;
    }

    const grant = await approvalRequestGrantsDAL.create(
      {
        projectId: request.projectId,
        requestId: request.id,
        granteeUserId: request.requesterId ?? null,
        granteeMachineIdentityId: request.machineIdentityId ?? null,
        status: ApprovalRequestGrantStatus.Active,
        type: request.type,
        attributes: grantAttributes,
        expiresAt: expiresAt ?? null
      },
      tx
    );

    return { grantId: grant.id };
  }
});
