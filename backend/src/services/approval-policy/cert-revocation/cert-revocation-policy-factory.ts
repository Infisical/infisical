import { ResourceType } from "@app/db/schemas";
import { RESOURCE_SCOPE } from "@app/db/schemas/models";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { getCertificateDisplayName } from "@app/services/certificate/certificate-fns";
import { TCertificateServiceFactory } from "@app/services/certificate/certificate-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { SmtpTemplates } from "@app/services/smtp/smtp-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { TApprovalPolicyDALFactory } from "../approval-policy-dal";
import {
  ApprovalAuditAction,
  ApprovalNotificationEvent,
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApproverType
} from "../approval-policy-enums";
import { TApprovalResource } from "../approval-policy-types";
import {
  approverKey,
  findLiveApproverEntries,
  holdsApprovingMembership,
  PKI_APPROVER_RULES,
  resolveApprovingPeople,
  TApproverEntry,
  TPkiApprovingPeopleDeps
} from "../pki-approvers/application-approver-checks";
import { findPeopleWhoCanApprove, isRevocationRequestUndecidable } from "./cert-revocation-policy-fns";
import {
  TCertRevocationPolicy,
  TCertRevocationPolicyInputs,
  TCertRevocationRequestData,
  TMatchedCertRevocationPolicy
} from "./cert-revocation-policy-types";

type TCertRevocationApprovalResourceDep = TPkiApprovingPeopleDeps & {
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findByProjectId" | "primaryNode">;
  certificateService: Pick<TCertificateServiceFactory, "revokeApprovedCertificate">;
  groupDAL: Pick<TGroupDALFactory, "find">;
};

export const certRevocationApprovalResourceFactory = ({
  approvalPolicyDAL,
  certificateService,
  membershipDAL,
  membershipRoleDAL,
  userGroupMembershipDAL,
  orgDAL,
  userDAL,
  groupDAL
}: TCertRevocationApprovalResourceDep): TApprovalResource<
  TCertRevocationPolicyInputs,
  TCertRevocationPolicy,
  TCertRevocationRequestData
> => {
  const membershipDeps = { membershipDAL, membershipRoleDAL, userGroupMembershipDAL };
  const approvingPeopleDeps = { ...membershipDeps, orgDAL, userDAL };
  const approverRule = PKI_APPROVER_RULES[ApprovalPolicyType.CertRevocation];

  return {
    scopeType: ApprovalPolicyScope.PkiApplication,

    // A missing policy sends the caller down the direct-revoke path, so a replica that hasn't seen a new policy
    // would skip approval. The primary has every policy the moment it's saved. Steps come back holding only the
    // approvers who can approve now, so the request's saved approvers are live ones, and each step carries how many
    // people can approve it, so revoking refuses a step that could never pass.
    matchPolicy: async (projectId, inputs): Promise<TMatchedCertRevocationPolicy | null> => {
      const primaryDb = approvalPolicyDAL.primaryNode();
      const policies = (await approvalPolicyDAL.findByProjectId(
        ApprovalPolicyType.CertRevocation,
        projectId,
        { scopeType: ApprovalPolicyScope.PkiApplication, scopeId: inputs.applicationId },
        primaryDb
      )) as TCertRevocationPolicy[];

      const policy = policies.find(
        (p) => p.isActive && p.conditions.conditions.some((c) => c.profileNames.includes(inputs.profileName))
      );
      if (!policy) return null;

      const people = await resolveApprovingPeople(
        approvingPeopleDeps,
        approverRule,
        { projectId, applicationId: inputs.applicationId },
        policy.steps.flatMap((step) => step.approvers),
        primaryDb
      );
      return {
        ...policy,
        steps: policy.steps.map((step) => ({
          ...step,
          approvers: step.approvers.filter((approver) => people.has(approverKey(approver))),
          approverCount: findPeopleWhoCanApprove(step.approvers, people).size
        }))
      };
    },

    // A request keeps the approvers it was raised with, so once too few of them can still approve, nothing short of
    // replacing it lets the certificate be revoked. Applications are resolved one at a time, so a list spanning many
    // doesn't take a burst of connections from the primary's small pool.
    findUndecidableRequestIds: async ({ requests, tx }) => {
      const byApplication = new Map<string, typeof requests>();
      requests.forEach((entry) => {
        if (!entry.request.scopeId) return;
        byApplication.set(entry.request.scopeId, [...(byApplication.get(entry.request.scopeId) ?? []), entry]);
      });

      const undecidable = new Set<string>();
      for (const [applicationId, entries] of byApplication) {
        const approvers = new Map(
          entries.flatMap(({ steps }) => steps.flatMap((step) => step.approvers.map((a) => [approverKey(a), a])))
        );
        // eslint-disable-next-line no-await-in-loop
        const people = await resolveApprovingPeople(
          approvingPeopleDeps,
          approverRule,
          { projectId: entries[0].request.projectId, applicationId },
          [...approvers.values()],
          tx
        );
        entries.forEach(({ request, steps }) => {
          if (isRevocationRequestUndecidable({ currentStep: request.currentStep, steps }, people)) {
            undecidable.add(request.id);
          }
        });
      }
      return undecidable;
    },

    // An approved revocation revokes the certificate rather than leaving a standing grant behind.
    canAccess: async () => null,

    validateConstraints: () => ({ valid: true }),

    // Listing and opening a request decide what a former approver can still see, so they read the primary like the
    // decision does.
    isLiveApprover: async ({ projectId, scopeId, actor, userGroupIds }) =>
      holdsApprovingMembership(
        membershipDeps,
        approverRule,
        { projectId, applicationId: scopeId },
        { userId: actor.id, userGroupIds },
        approvalPolicyDAL.primaryNode()
      ),

    assertCanReviewReadsThroughTx: true,

    // A replica that hasn't seen a member's removal or demotion would still let them decide, so the decision reads the
    // primary, or the transaction holding the request's lock when there is one.
    assertCanReview: async ({ request, actor, userGroupIds, stepApprovers, tx }) => {
      const { projectId, scopeId } = request;
      if (!scopeId) {
        throw new ForbiddenRequestError({
          message: "You can't review this request because it isn't attached to an Application."
        });
      }
      const primaryDb = tx ?? approvalPolicyDAL.primaryNode();
      const liveEntries = await findLiveApproverEntries(
        membershipDeps,
        approverRule,
        { projectId, applicationId: scopeId },
        stepApprovers,
        primaryDb
      );
      const namesActor = (approver: TApproverEntry) =>
        approver.type === ApproverType.User ? approver.id === actor.id : userGroupIds.has(approver.id);
      if (liveEntries.some(namesActor)) return;

      // A user entry is live whenever its user holds an approving role, so an actor who still holds one was named
      // only through groups that lost theirs.
      const stillHoldsRole = await holdsApprovingMembership(
        membershipDeps,
        approverRule,
        { projectId, applicationId: scopeId },
        { userId: actor.id, userGroupIds },
        primaryDb
      );
      throw new ForbiddenRequestError({
        message: stillHoldsRole
          ? "You can't review this request because the group that names you as an approver no longer has a role in its Application that can approve requests."
          : "You can't review this request because you no longer have a role in its Application that can approve requests."
      });
    },

    // Saving an approver who can't approve would let a revocation open a request nobody can decide.
    verifyPolicyActors: async ({ projectId, scopeId, approvers }) => {
      if (!scopeId || approvers.length === 0) return;
      const entries = approvers.map((approver) => ({ type: approver.type as ApproverType, id: approver.id }));
      const liveKeys = new Set(
        (
          await findLiveApproverEntries(
            membershipDeps,
            approverRule,
            { projectId, applicationId: scopeId },
            entries,
            approvalPolicyDAL.primaryNode()
          )
        ).map(approverKey)
      );
      const unable = entries.filter((entry) => !liveKeys.has(approverKey(entry)));
      if (unable.length === 0) return;

      const userIds = unable.filter((entry) => entry.type === ApproverType.User).map((entry) => entry.id);
      const groupIds = unable.filter((entry) => entry.type === ApproverType.Group).map((entry) => entry.id);
      // Approver IDs come from the caller, so only those with a membership in this Application (in any role) are
      // looked up and named; any other ID is returned as sent, or the refusal would name another organization's users
      // and groups. Names follow the approver picker's order (name, username, email).
      const applicationMemberships = await membershipDAL.find(
        {
          scope: RESOURCE_SCOPE,
          scopeProjectId: projectId,
          scopeResourceType: ResourceType.CertificateApplication,
          scopeResourceId: scopeId
        },
        { tx: approvalPolicyDAL.primaryNode() }
      );
      const memberUserIds = userIds.filter((id) => applicationMemberships.some((m) => m.actorUserId === id));
      const memberGroupIds = groupIds.filter((id) => applicationMemberships.some((m) => m.actorGroupId === id));
      const [users, groups] = await Promise.all([
        memberUserIds.length ? userDAL.find({ $in: { id: memberUserIds } }) : [],
        memberGroupIds.length ? groupDAL.find({ $in: { id: memberGroupIds } }) : []
      ]);
      const userLabels = new Map(
        users.map((user) => [
          user.id,
          [user.firstName, user.lastName].filter((part) => part?.trim()).join(" ") || user.username || user.email
        ])
      );
      const groupLabels = new Map(groups.map((group) => [group.id, group.name]));
      const parts = [
        ...(userIds.length ? [`users ${userIds.map((id) => userLabels.get(id) || id).join(", ")}`] : []),
        ...(groupIds.length ? [`groups ${groupIds.map((id) => groupLabels.get(id) || id).join(", ")}`] : [])
      ];
      throw new BadRequestError({
        message: `Revocation approvers need an Admin or Operator role in the Application, so they can approve requests. These approvers are Auditors or aren't in the Application: ${parts.join("; ")}.`
      });
    },

    // Notifications name the certificate (and, on failure, why), and the request's approver snapshot outlives a
    // member's removal or demotion, so only approvers who can still approve are told.
    filterActiveApprovers: async (request, approvers) => {
      if (!request.scopeId) return [];
      return findLiveApproverEntries(
        membershipDeps,
        approverRule,
        { projectId: request.projectId, applicationId: request.scopeId },
        approvers,
        approvalPolicyDAL.primaryNode()
      );
    },

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
  };
};
