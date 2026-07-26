import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

export type TPrincipalScopeDALs = {
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  projectDAL: Pick<TProjectDALFactory, "findEffectiveProjectSubjectsMembership">;
  // Only needed when org-scoped group membership must be verified (see below).
  groupDAL?: Pick<TGroupDALFactory, "find">;
};

export type TPrincipalScope = { orgId: string; projectId?: string | null };

export type TInScopePrincipals = { userIds: Set<string>; groupIds: Set<string> };

/**
 * Narrows a set of user/group ids down to the ones that are actually in the alert's scope. Shared by
 * the write path (validating an alert channel's recipients) and the send path (re-checking recipients
 * at delivery time), so both agree on what "in scope" means.
 *
 * Project scope: effective project membership, i.e. directly added or inherited via a project group.
 * Org scope: org membership for users. Groups are verified against the org only when `groupDAL` is
 * supplied — a group cannot move between orgs, so the send path skips that query and trusts the ids
 * that were already validated at write time.
 */
export const resolvePrincipalsInScope = async (
  { orgDAL, projectDAL, groupDAL }: TPrincipalScopeDALs,
  { orgId, projectId, userIds, groupIds }: TPrincipalScope & { userIds: string[]; groupIds: string[] }
): Promise<TInScopePrincipals> => {
  if (userIds.length === 0 && groupIds.length === 0) return { userIds: new Set(), groupIds: new Set() };

  if (projectId) {
    const { effectiveUserIds, effectiveGroupIds } = await projectDAL.findEffectiveProjectSubjectsMembership({
      orgId,
      projectId,
      userIds,
      groupIds
    });
    return { userIds: new Set(effectiveUserIds), groupIds: new Set(effectiveGroupIds) };
  }

  const inScopeUserIds = new Set<string>();
  if (userIds.length) {
    const memberships = await orgDAL.findMembership({ $in: { actorUserId: userIds }, scopeOrgId: orgId });
    memberships.forEach((membership) => {
      if (membership.actorUserId) inScopeUserIds.add(membership.actorUserId);
    });
  }

  if (!groupDAL || groupIds.length === 0) return { userIds: inScopeUserIds, groupIds: new Set(groupIds) };

  const orgGroups = await groupDAL.find({ $in: { id: groupIds }, orgId });
  return { userIds: inScopeUserIds, groupIds: new Set(orgGroups.map((group) => group.id)) };
};
