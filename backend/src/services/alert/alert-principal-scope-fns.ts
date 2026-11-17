import { Knex } from "knex";

import { OrgMembershipStatus, ProjectMembershipRole } from "@app/db/schemas";
import { TEmailDomainDALFactory } from "@app/ee/services/email-domain/email-domain-dal";
import { EmailDomainStatus } from "@app/ee/services/email-domain/email-domain-types";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { isActiveRole } from "@app/ee/services/permission/permission-fns";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { IResourceAlertProvider, TAlertRecipientScope } from "./alert-types";

export type TPrincipalScopeDALs = {
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  projectDAL: Pick<TProjectDALFactory, "findEffectiveProjectSubjectsMembership">;
  // Only needed when org-scoped group membership must be verified (see below).
  groupDAL?: Pick<TGroupDALFactory, "find">;
};

export type TPrincipalScope = { orgId: string; projectId?: string | null };

export type TInScopePrincipals = { userIds: Set<string>; groupIds: Set<string> };

export type TOrgAccessDALs = {
  orgDAL: Pick<TOrgDALFactory, "findMembership" | "findActorsWithActiveOrgAccess">;
  userDAL: Pick<TUserDALFactory, "find">;
};

// Users with a way into the org: an active, accepted membership of their own, or, without one, an accepted account
// in a group linked into the org. The second is how everyone reaches a sub-org. Losing that path leaves project
// memberships behind until the org access reconcile removes them, so the project's member listings alone can't be
// trusted for it.
export const findUsersWithOrgAccess = async (
  { orgDAL, userDAL }: TOrgAccessDALs,
  { orgId, userIds }: { orgId: string; userIds: string[] },
  tx?: Knex
): Promise<Set<string>> => {
  const withAccess = new Set<string>();
  if (userIds.length === 0) return withAccess;

  const withOwnMembership = new Set<string>();
  (await orgDAL.findMembership({ $in: { actorUserId: userIds }, scopeOrgId: orgId }, { tx })).forEach((membership) => {
    if (!membership.actorUserId) return;
    withOwnMembership.add(membership.actorUserId);
    if (membership.isActive && membership.status === OrgMembershipStatus.Accepted) {
      withAccess.add(membership.actorUserId);
    }
  });

  const throughGroupOnly = userIds.filter((userId) => !withOwnMembership.has(userId));
  if (throughGroupOnly.length === 0) return withAccess;

  // A group row's isPending isn't cleared when its user finishes signup, so the account itself is checked instead.
  const acceptedUserIds = (await userDAL.find({ $in: { id: throughGroupOnly } }, { tx }))
    .filter((user) => user.isAccepted)
    .map((user) => user.id);
  if (acceptedUserIds.length === 0) return withAccess;

  const { userIds: viaGroup } = await orgDAL.findActorsWithActiveOrgAccess(
    { orgId, userIds: acceptedUserIds, identityIds: [] },
    tx
  );
  viaGroup.forEach((userId) => withAccess.add(userId));
  return withAccess;
};

// Direct project members only: admins through a group are left out on purpose.
export const findProjectAdminUserIds = async (
  deps: TOrgAccessDALs & {
    projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  },
  { orgId, projectId }: { orgId: string; projectId: string }
): Promise<Set<string>> => {
  const admins = (await deps.projectMembershipDAL.findAllProjectMembers(projectId)).filter((member) =>
    member.roles.some((role) => role.role === ProjectMembershipRole.Admin && isActiveRole(role))
  );
  return findUsersWithOrgAccess(deps, { orgId, userIds: [...new Set(admins.map((member) => member.user.id))] });
};

export const isOnVerifiedDomain = (email: string, verifiedDomains: Set<string>) =>
  verifiedDomains.has(email.split("@")[1]?.toLowerCase() ?? "");

export const findVerifiedEmailDomains = async (
  emailDomainDAL: Pick<TEmailDomainDALFactory, "find">,
  orgId: string,
  tx?: Knex
): Promise<Set<string>> =>
  new Set(
    (await emailDomainDAL.find({ orgId, status: EmailDomainStatus.Verified }, { tx })).map((domain) =>
      domain.domain.toLowerCase()
    )
  );

/**
 * Narrows a set of user/group ids down to the ones that are actually in the alert's scope. Shared by
 * the write path (validating an alert channel's recipients) and the send path (re-checking recipients
 * at delivery time), so both agree on what "in scope" means.
 *
 * Users must hold an active, accepted org membership in every scope — a deactivated user and a user
 * with a pending invite both keep their memberships, so the project query alone would still match
 * them and they'd receive alerts.
 *
 * Project scope: effective project membership, i.e. directly added or inherited via a project group.
 * Org scope: org membership for users. Groups are verified against the org only when `groupDAL` is
 * supplied — a group cannot move between orgs, so the send path skips that query and trusts the ids
 * that were already validated at write time.
 */
export const resolvePrincipalsInScope = async (
  { orgDAL, projectDAL, groupDAL }: TPrincipalScopeDALs,
  { orgId, projectId, userIds, groupIds }: TPrincipalScope & { userIds: string[]; groupIds: string[] },
  tx?: Knex
): Promise<TInScopePrincipals> => {
  if (userIds.length === 0 && groupIds.length === 0) return { userIds: new Set(), groupIds: new Set() };

  const activeOrgUserIds = new Set<string>();
  if (userIds.length) {
    const memberships = await orgDAL.findMembership(
      {
        $in: { actorUserId: userIds },
        scopeOrgId: orgId,
        isActive: true,
        status: OrgMembershipStatus.Accepted
      },
      { tx }
    );
    memberships.forEach((membership) => {
      if (membership.actorUserId) activeOrgUserIds.add(membership.actorUserId);
    });
  }

  if (projectId) {
    const { effectiveUserIds, effectiveGroupIds } = await projectDAL.findEffectiveProjectSubjectsMembership({
      orgId,
      projectId,
      userIds: [...activeOrgUserIds],
      groupIds,
      tx
    });
    return { userIds: new Set(effectiveUserIds), groupIds: new Set(effectiveGroupIds) };
  }

  const inScopeUserIds = activeOrgUserIds;

  if (!groupDAL || groupIds.length === 0) return { userIds: inScopeUserIds, groupIds: new Set(groupIds) };

  const orgGroups = await groupDAL.find({ $in: { id: groupIds }, orgId }, { tx });
  return { userIds: inScopeUserIds, groupIds: new Set(orgGroups.map((group) => group.id)) };
};

export const getRecipientScope = (
  provider: Pick<IResourceAlertProvider, "recipientPolicy">,
  projectId?: string | null
): TAlertRecipientScope => ({
  projectId: provider.recipientPolicy?.atOrgScope ? null : (projectId ?? null),
  allowEmailAddresses: Boolean(provider.recipientPolicy?.allowEmailAddresses),
  allowProjectAdmins: Boolean(provider.recipientPolicy?.allowProjectAdmins)
});
