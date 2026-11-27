import { Knex } from "knex";

import { AccessScope, OrgMembershipStatus, ResourceType } from "@app/db/schemas";
import { ProjectMembershipRole, RESOURCE_SCOPE, ResourceMembershipRole } from "@app/db/schemas/models";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { findUsersWithOrgAccess, TOrgAccessDALs } from "@app/services/alert/alert-principal-scope-fns";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { ApprovalPolicyType, ApproverType } from "../approval-policy-enums";

export type TApproverEntry = { type: ApproverType; id: string };

export const approverKey = (approver: TApproverEntry) => `${approver.type}:${approver.id}`;

// The users who can approve through each approver entry, keyed by approverKey.
export type TApprovingPeople = Map<string, Set<string>>;

export type TPkiApproverMembershipDeps = {
  membershipDAL: Pick<TMembershipDALFactory, "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
};

export type TPkiApprovingPeopleDeps = TPkiApproverMembershipDeps &
  TOrgAccessDALs & { orgDAL: Pick<TOrgDALFactory, "findById"> };

type TPkiApproverRule = {
  // Left out when every Application role can approve, so no role is read.
  isApprovingApplicationRole?: (role: string) => boolean;
  // A request with no Application is judged against Certificate Management members; otherwise it has no live approvers.
  judgesRequestsWithoutApplication: boolean;
};

export const PKI_APPROVER_RULES: Record<
  ApprovalPolicyType.CertRequest | ApprovalPolicyType.CertRevocation,
  TPkiApproverRule
> = {
  // Issuance approvers have always been any member of the Application, whatever their role. A policy from before
  // Applications names Certificate Management members.
  [ApprovalPolicyType.CertRequest]: { judgesRequestsWithoutApplication: true },
  [ApprovalPolicyType.CertRevocation]: {
    isApprovingApplicationRole: (role) => role !== ResourceMembershipRole.Auditor,
    judgesRequestsWithoutApplication: false
  }
};

type TPkiApproverScope = { projectId: string; applicationId: string | null };

// A request snapshots its approvers when it is raised. Removing a member from the Application or changing their role
// only edits the membership, so the snapshot alone would let them decide requests that were already pending. A
// membership counts only while it is active and holds a role the policy type's rule accepts. A Certificate Management
// member with No Access can't open the product, so that role never approves a request with no Application.
const findApprovingMemberships = async (
  { membershipDAL, membershipRoleDAL }: TPkiApproverMembershipDeps,
  rule: TPkiApproverRule,
  { projectId, applicationId }: TPkiApproverScope,
  tx?: Knex
) => {
  if (!applicationId && !rule.judgesRequestsWithoutApplication) return [];
  const memberships = (
    await membershipDAL.find(
      applicationId
        ? {
            scope: RESOURCE_SCOPE,
            scopeProjectId: projectId,
            scopeResourceType: ResourceType.CertificateApplication,
            scopeResourceId: applicationId
          }
        : { scope: AccessScope.Project, scopeProjectId: projectId },
      { tx }
    )
  ).filter((membership) => membership.isActive);
  const isApprovingRole = applicationId
    ? rule.isApprovingApplicationRole
    : (role: string) => role !== ProjectMembershipRole.NoAccess;
  if (memberships.length === 0 || !isApprovingRole) return memberships;

  const roles = await membershipRoleDAL.find({ $in: { membershipId: memberships.map((m) => m.id) } }, { tx });
  const approvingMembershipIds = new Set(roles.filter((r) => isApprovingRole(r.role)).map((r) => r.membershipId));
  return memberships.filter((membership) => approvingMembershipIds.has(membership.id));
};

export const holdsApprovingMembership = async (
  deps: TPkiApproverMembershipDeps,
  rule: TPkiApproverRule,
  scope: TPkiApproverScope,
  { userId, userGroupIds }: { userId: string; userGroupIds: Set<string> },
  tx?: Knex
) => {
  const memberships = await findApprovingMemberships(deps, rule, scope, tx);
  return memberships.some(
    (membership) =>
      membership.actorUserId === userId || Boolean(membership.actorGroupId && userGroupIds.has(membership.actorGroupId))
  );
};

// The approver entries that can still approve: a user entry while that user holds an approving membership directly or
// through a group, a group entry while the group itself holds one. Each entry is judged on its own, so a user named
// only through a group the Admin removed can't approve on the strength of an unrelated direct role. A policy with no
// Application never had its group approvers checked against Certificate Management when it was saved, and they can
// still approve, so its group entries stay live.
const $findLiveEntries = async <T extends TApproverEntry>(
  deps: TPkiApproverMembershipDeps,
  rule: TPkiApproverRule,
  scope: TPkiApproverScope,
  approvers: T[],
  tx?: Knex
): Promise<{ live: T[]; orgId: string | null }> => {
  if (approvers.length === 0) return { live: [], orgId: null };
  const memberships = await findApprovingMemberships(deps, rule, scope, tx);
  const groupEntriesStayLive = !scope.applicationId && rule.judgesRequestsWithoutApplication;
  if (memberships.length === 0) {
    return { live: groupEntriesStayLive ? approvers.filter((a) => a.type === ApproverType.Group) : [], orgId: null };
  }
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

  return {
    live: approvers.filter((a) =>
      a.type === ApproverType.Group
        ? groupEntriesStayLive || memberGroupIds.has(a.id)
        : memberUserIds.has(a.id) || memberViaGroup.has(a.id)
    ),
    orgId: memberships[0].scopeOrgId
  };
};

export const findLiveApproverEntries = async <T extends TApproverEntry>(
  deps: TPkiApproverMembershipDeps,
  rule: TPkiApproverRule,
  scope: TPkiApproverScope,
  approvers: T[],
  tx?: Knex
): Promise<T[]> => (await $findLiveEntries(deps, rule, scope, approvers, tx)).live;

// Signing in to a sub-org also takes an active membership in its root organization (validateTokenOrgScope), so a
// sub-org user deactivated there can't approve, however their sub-org access looks.
const $keepRootOrgMembers = async (
  { orgDAL }: Pick<TPkiApprovingPeopleDeps, "orgDAL">,
  orgId: string,
  userIds: Set<string>,
  tx?: Knex
) => {
  if (userIds.size === 0) return userIds;
  const org = await orgDAL.findById(orgId, tx);
  if (!org?.rootOrgId || org.rootOrgId === orgId) return userIds;
  const { userIds: inRoot } = await orgDAL.findActorsWithActiveOrgAccess(
    { orgId: org.rootOrgId, userIds: [...userIds], identityIds: [] },
    tx
  );
  return new Set([...userIds].filter((userId) => inRoot.has(userId)));
};

// The people who can approve through each live entry, counted only while they can sign in to the organization. A user
// entry's user may reach it through a group linked into it, as everyone in a sub-org does. A group entry's member
// approves through the group only with an active, accepted organization membership of their own, since that is the
// row the group lookup at review time joins on. An empty group names nobody.
export const resolveApprovingPeople = async (
  deps: TPkiApprovingPeopleDeps,
  rule: TPkiApproverRule,
  scope: TPkiApproverScope,
  approvers: TApproverEntry[],
  tx?: Knex
): Promise<TApprovingPeople> => {
  const { live, orgId } = await $findLiveEntries(deps, rule, scope, approvers, tx);
  const liveGroupIds = live.filter((a) => a.type === ApproverType.Group).map((a) => a.id);
  const groupLinks = liveGroupIds.length
    ? await deps.userGroupMembershipDAL.find({ $in: { groupId: liveGroupIds } }, { tx })
    : [];

  const namedUserIds = [...new Set(live.filter((a) => a.type === ApproverType.User).map((a) => a.id))];
  const groupMemberIds = [...new Set(groupLinks.map((link) => link.userId))];
  const namedUsersWithAccess = orgId
    ? await $keepRootOrgMembers(
        deps,
        orgId,
        await findUsersWithOrgAccess(deps, { orgId, userIds: namedUserIds }, tx),
        tx
      )
    : new Set<string>();
  const groupMembersWithAccess =
    orgId && groupMemberIds.length
      ? await $keepRootOrgMembers(
          deps,
          orgId,
          new Set(
            (
              await deps.membershipDAL.find(
                {
                  scope: AccessScope.Organization,
                  scopeOrgId: orgId,
                  isActive: true,
                  status: OrgMembershipStatus.Accepted,
                  $in: { actorUserId: groupMemberIds }
                },
                { tx }
              )
            ).flatMap((m) => (m.actorUserId ? [m.actorUserId] : []))
          ),
          tx
        )
      : new Set<string>();

  return new Map(
    live.map((entry) => [
      approverKey(entry),
      entry.type === ApproverType.User
        ? new Set(namedUsersWithAccess.has(entry.id) ? [entry.id] : [])
        : new Set(
            groupLinks
              .filter((link) => link.groupId === entry.id && groupMembersWithAccess.has(link.userId))
              .map((link) => link.userId)
          )
    ])
  );
};
