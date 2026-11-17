import { Knex } from "knex";

import { ResourceType } from "@app/db/schemas";
import { RESOURCE_SCOPE, ResourceMembershipRole } from "@app/db/schemas/models";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { getCertificateDisplayName } from "@app/services/certificate/certificate-fns";
import { TCertificateServiceFactory } from "@app/services/certificate/certificate-service";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
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
  TCertRevocationPolicy,
  TCertRevocationPolicyInputs,
  TCertRevocationRequestData
} from "./cert-revocation-policy-types";

type TCertRevocationApprovalResourceDep = {
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findByProjectId" | "primaryNode">;
  certificateService: Pick<TCertificateServiceFactory, "revokeApprovedCertificate">;
  membershipDAL: Pick<TMembershipDALFactory, "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
};

type TMembershipDeps = Pick<
  TCertRevocationApprovalResourceDep,
  "membershipDAL" | "membershipRoleDAL" | "userGroupMembershipDAL"
>;
type TApproverEntry = { type: ApproverType; id: string };

// A request snapshots its approvers when it is raised. Removing a member from the Application or demoting them to
// Auditor only edits the policy, so the snapshot alone would let them decide requests that were already pending.
// A membership counts only while it is active and holds a role that can approve.
const findApprovingApplicationMemberships = async (
  { membershipDAL, membershipRoleDAL }: TMembershipDeps,
  { projectId, applicationId }: { projectId: string; applicationId: string },
  tx?: Knex
) => {
  const memberships = (
    await membershipDAL.find(
      {
        scope: RESOURCE_SCOPE,
        scopeProjectId: projectId,
        scopeResourceType: ResourceType.CertificateApplication,
        scopeResourceId: applicationId
      },
      { tx }
    )
  ).filter((membership) => membership.isActive);
  if (memberships.length === 0) return [];

  const roles = await membershipRoleDAL.find({ $in: { membershipId: memberships.map((m) => m.id) } }, { tx });
  const approvingMembershipIds = new Set(
    roles.filter((r) => r.role !== ResourceMembershipRole.Auditor).map((r) => r.membershipId)
  );
  return memberships.filter((membership) => approvingMembershipIds.has(membership.id));
};

const holdsApprovingMembership = async (
  deps: TMembershipDeps,
  {
    projectId,
    applicationId,
    userId,
    userGroupIds
  }: { projectId: string; applicationId: string; userId: string; userGroupIds: Set<string> },
  tx?: Knex
) => {
  const memberships = await findApprovingApplicationMemberships(deps, { projectId, applicationId }, tx);
  return memberships.some(
    (membership) =>
      membership.actorUserId === userId || Boolean(membership.actorGroupId && userGroupIds.has(membership.actorGroupId))
  );
};

// The approver entries that can still approve: a user entry while that user holds an approving role directly or
// through a group, a group entry while the group itself holds one. Each entry is judged on its own, so a user named
// only through a group the Admin removed can't approve on the strength of an unrelated direct role.
const findLiveApproverEntries = async <T extends TApproverEntry>(
  deps: TMembershipDeps,
  { projectId, applicationId }: { projectId: string; applicationId: string },
  approvers: T[],
  tx?: Knex
): Promise<T[]> => {
  if (approvers.length === 0) return [];
  const memberships = await findApprovingApplicationMemberships(deps, { projectId, applicationId }, tx);
  const memberUserIds = new Set(memberships.flatMap((m) => (m.actorUserId ? [m.actorUserId] : [])));
  const memberGroupIds = new Set(memberships.flatMap((m) => (m.actorGroupId ? [m.actorGroupId] : [])));

  const usersToCheckViaGroups = approvers
    .filter((a) => a.type === ApproverType.User && !memberUserIds.has(a.id))
    .map((a) => a.id);
  const memberViaGroup = new Set<string>();
  if (usersToCheckViaGroups.length > 0 && memberGroupIds.size > 0) {
    const links = await deps.userGroupMembershipDAL.find(
      { $in: { userId: usersToCheckViaGroups, groupId: [...memberGroupIds] } },
      { tx }
    );
    links.forEach((link) => memberViaGroup.add(link.userId));
  }

  return approvers.filter((a) =>
    a.type === ApproverType.Group ? memberGroupIds.has(a.id) : memberUserIds.has(a.id) || memberViaGroup.has(a.id)
  );
};

const approverKey = (approver: TApproverEntry) => `${approver.type}:${approver.id}`;

export const certRevocationApprovalResourceFactory = ({
  approvalPolicyDAL,
  certificateService,
  membershipDAL,
  membershipRoleDAL,
  userGroupMembershipDAL
}: TCertRevocationApprovalResourceDep): TApprovalResource<
  TCertRevocationPolicyInputs,
  TCertRevocationPolicy,
  TCertRevocationRequestData
> => {
  const membershipDeps = { membershipDAL, membershipRoleDAL, userGroupMembershipDAL };

  return {
    scopeType: ApprovalPolicyScope.PkiApplication,

    // A missing policy sends the caller down the direct-revoke path, so a replica that hasn't seen a new policy
    // would skip approval. The primary has every policy the moment it's saved. Steps come back holding only the
    // approvers who can approve now, so the revoke-time shortfall check and the request's saved approvers agree.
    matchPolicy: async (projectId, inputs) => {
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

      const liveKeys = new Set(
        (
          await findLiveApproverEntries(
            membershipDeps,
            { projectId, applicationId: inputs.applicationId },
            policy.steps.flatMap((step) => step.approvers),
            primaryDb
          )
        ).map(approverKey)
      );
      return {
        ...policy,
        steps: policy.steps.map((step) => ({
          ...step,
          approvers: step.approvers.filter((approver) => liveKeys.has(approverKey(approver)))
        }))
      };
    },

    // An approved revocation revokes the certificate rather than leaving a standing grant behind.
    canAccess: async () => null,

    validateConstraints: () => ({ valid: true }),

    // Listing and opening a request decide what a former approver can still see, so they read the primary like the
    // decision does.
    isLiveApprover: async ({ projectId, scopeId, actor, userGroupIds }) =>
      holdsApprovingMembership(
        membershipDeps,
        { projectId, applicationId: scopeId, userId: actor.id, userGroupIds },
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
        { projectId, applicationId: scopeId, userId: actor.id, userGroupIds },
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
      const parts = [
        ...(userIds.length ? [`users ${userIds.join(", ")}`] : []),
        ...(groupIds.length ? [`groups ${groupIds.join(", ")}`] : [])
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
