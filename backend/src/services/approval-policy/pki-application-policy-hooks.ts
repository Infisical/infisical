import { ResourceType } from "@app/db/schemas";
import { RESOURCE_SCOPE } from "@app/db/schemas/models";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TPkiApplicationProfileDALFactory } from "@app/services/pki-application/pki-application-profile-dal";

import { ApprovalPolicyScope } from "./approval-policy-enums";
import { filterApproversByActiveMemberships } from "./approval-policy-fns";
import { TApprovalResource } from "./approval-policy-types";
import { TCertRequestPolicyConditions } from "./cert-request/cert-request-policy-types";

export type TPkiApplicationPolicyHooksDep = {
  membershipDAL: Pick<TMembershipDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  pkiApplicationProfileDAL: Pick<TPkiApplicationProfileDALFactory, "findByApplicationId">;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "find">;
};

const quoteNames = (names: string[]) => names.map((name) => `'${name}'`).join(", ");

const findActiveApplicationMemberships = async (
  membershipDAL: TPkiApplicationPolicyHooksDep["membershipDAL"],
  projectId: string,
  applicationId: string
) => {
  const memberships = await membershipDAL.find({
    scope: RESOURCE_SCOPE,
    scopeProjectId: projectId,
    scopeResourceType: ResourceType.CertificateApplication,
    scopeResourceId: applicationId
  });
  return memberships.filter((membership) => membership.isActive);
};

// A request snapshots its approvers when it is raised, and removing a member from the Application only edits the
// policy, so the snapshot alone would let a removed member decide requests that were already pending.
const holdsApplicationMembership = async (
  membershipDAL: TPkiApplicationPolicyHooksDep["membershipDAL"],
  {
    projectId,
    applicationId,
    userId,
    userGroupIds
  }: {
    projectId: string;
    applicationId: string;
    userId: string;
    userGroupIds: Set<string>;
  }
) => {
  const memberships = await findActiveApplicationMemberships(membershipDAL, projectId, applicationId);
  return memberships.some(
    (membership) =>
      membership.actorUserId === userId || Boolean(membership.actorGroupId && userGroupIds.has(membership.actorGroupId))
  );
};

// Certificate approval policies scoped to a PKI Application match on profile slugs and take their approvers from the
// Application's members, so every certificate approval type shares these checks.
export const pkiApplicationPolicyHooksFactory = ({
  membershipDAL,
  userGroupMembershipDAL,
  pkiApplicationProfileDAL,
  certificateProfileDAL
}: TPkiApplicationPolicyHooksDep): Required<
  Pick<TApprovalResource, "validateConditions" | "isLiveApprover" | "assertCanReview" | "filterActiveApprovers">
> => ({
  validateConditions: async ({ projectId, scopeId, conditions }) => {
    const profileNameGroups = (conditions as TCertRequestPolicyConditions).map((condition) => condition.profileNames);
    if (profileNameGroups.length === 0 || profileNameGroups.some((names) => names.length === 0)) {
      throw new BadRequestError({
        message: "Select at least one certificate profile. A policy with no profiles never applies to any certificate."
      });
    }

    const knownProfileNames = new Set(
      scopeId
        ? (await pkiApplicationProfileDAL.findByApplicationId(scopeId)).map((profile) => profile.profileSlug)
        : (await certificateProfileDAL.find({ projectId })).map((profile) => profile.slug)
    );
    const unknownProfileNames = [...new Set(profileNameGroups.flat())].filter((name) => !knownProfileNames.has(name));
    if (unknownProfileNames.length === 0) return;

    const isOne = unknownProfileNames.length === 1;
    throw new BadRequestError({
      message: scopeId
        ? `Certificate ${isOne ? "profile" : "profiles"} ${quoteNames(unknownProfileNames)} ${
            isOne ? "isn't" : "aren't"
          } attached to this Application. Attach ${isOne ? "it" : "them"} to the Application first, or remove ${
            isOne ? "it" : "them"
          } from the policy.`
        : `Certificate ${isOne ? "profile" : "profiles"} ${quoteNames(unknownProfileNames)} ${
            isOne ? "doesn't" : "don't"
          } exist. Check the ${isOne ? "name" : "names"}, or remove ${isOne ? "it" : "them"} from the policy.`
    });
  },

  isLiveApprover: async ({ projectId, scopeId, actor, userGroupIds }) =>
    holdsApplicationMembership(membershipDAL, { projectId, applicationId: scopeId, userId: actor.id, userGroupIds }),

  assertCanReview: async ({ request, actor, userGroupIds }) => {
    if (request.scopeType !== ApprovalPolicyScope.PkiApplication || !request.scopeId) return;

    const isMember = await holdsApplicationMembership(membershipDAL, {
      projectId: request.projectId,
      applicationId: request.scopeId,
      userId: actor.id,
      userGroupIds
    });
    if (!isMember) {
      throw new ForbiddenRequestError({
        message: "You can't review this request because you're no longer a member of its Application."
      });
    }
  },

  filterActiveApprovers: async (request, approvers) => {
    if (request.scopeType !== ApprovalPolicyScope.PkiApplication || !request.scopeId || approvers.length === 0) {
      return approvers;
    }

    const memberships = await findActiveApplicationMemberships(membershipDAL, request.projectId, request.scopeId);
    return filterApproversByActiveMemberships(userGroupMembershipDAL, approvers, memberships);
  }
});
