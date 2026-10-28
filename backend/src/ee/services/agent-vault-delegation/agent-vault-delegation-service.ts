import { ForbiddenError, subject } from "@casl/ability";
import { Knex } from "knex";

import { AccessScope, ProjectMembershipRole, RESOURCE_SCOPE, ResourceType, TMemberships } from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { isActiveRole } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TGenericPermission } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";

import { AgentVaultDelegationScope } from "../agent-vault/agent-vault-enums";
import { getAgentVaultPermission, getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import { TAgentVaultAccessBundleDALFactory } from "../agent-vault-access-bundle/agent-vault-access-bundle-dal";
import {
  TAgentVaultDelegationDALFactory,
  TAgentVaultDelegationSubjectDALFactory,
  TAgentVaultDelegationView
} from "./agent-vault-delegation-dal";
import {
  TDeleteDelegationDTO,
  TGetDelegationDTO,
  TListDelegationsDTO,
  TSetDelegationDTO
} from "./agent-vault-delegation-types";

type TAgentVaultDelegationServiceFactoryDep = {
  agentVaultDelegationDAL: Pick<
    TAgentVaultDelegationDALFactory,
    "upsertScope" | "findViews" | "delete" | "transaction" | "lockMemberships"
  >;
  agentVaultDelegationSubjectDAL: Pick<TAgentVaultDelegationSubjectDALFactory, "find" | "delete" | "insertMany">;
  agentVaultAccessBundleDAL: Pick<TAgentVaultAccessBundleDALFactory, "find">;
  membershipDAL: Pick<TMembershipDALFactory, "find" | "findResourceMembershipsForActor">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TAgentVaultDelegationServiceFactory = ReturnType<typeof agentVaultDelegationServiceFactory>;

type TMissingAccessBundle = { id: string; name: string };

// The row id stays internal: a delegation is named by its machine identity, the one id a client sends back.
const toDelegation = ({ id, ...delegation }: TAgentVaultDelegationView) => delegation;

const withNoMissingAccessBundles = (delegation: TAgentVaultDelegationView) => ({
  ...toDelegation(delegation),
  users: delegation.users.map((user) => ({ ...user, missingAccessBundles: [] as TMissingAccessBundle[] })),
  groups: delegation.groups.map((group) => ({ ...group, missingAccessBundles: [] as TMissingAccessBundle[] })),
  missingAccessBundles: [] as TMissingAccessBundle[]
});

const quoted = (ids: string[]) => ids.map((id) => `'${id}'`).join(", ");

export const agentVaultDelegationServiceFactory = ({
  agentVaultDelegationDAL,
  agentVaultDelegationSubjectDAL,
  agentVaultAccessBundleDAL,
  membershipDAL,
  membershipRoleDAL,
  userGroupMembershipDAL,
  permissionService
}: TAgentVaultDelegationServiceFactoryDep) => {
  // A delegation says whom an identity can act as, so managing one is managing the identity, which in Agent Vault only
  // the admin role can do.
  const checkIdentityPermission = async (
    { projectId, ctx, machineIdentityId }: { projectId: string; ctx: TGenericPermission; machineIdentityId?: string },
    action: ProjectPermissionIdentityActions
  ) => {
    const { permission } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      action,
      machineIdentityId
        ? subject(ProjectPermissionSub.Identity, { identityId: machineIdentityId })
        : ProjectPermissionSub.Identity
    );
  };

  const notFound = (machineIdentityId: string) =>
    new NotFoundError({
      message: `Machine identity with ID '${machineIdentityId}' has no delegation, so it can't act on behalf of users`
    });

  // The same rule as granting an access bundle: a subject is named by its own Agent Vault membership. The memberships
  // are the rows the save holds locked, so no removal can land between this check and the write.
  const assertSubjectsInAgentVault = async (
    {
      projectId,
      userIds,
      groupIds,
      memberships
    }: {
      projectId: string;
      userIds: string[];
      groupIds: string[];
      memberships: Pick<TMemberships, "actorUserId" | "actorGroupId">[];
    },
    tx: Knex
  ) => {
    const memberGroups = new Set(memberships.map((row) => row.actorGroupId));
    const missingGroups = groupIds.filter((id) => !memberGroups.has(id));
    if (missingGroups.length) {
      throw new BadRequestError({
        message: `Group(s) ${quoted(missingGroups)} are not members of Agent Vault. Add them under Access Control first.`
      });
    }

    const memberUsers = new Set(memberships.map((row) => row.actorUserId));
    const missingUsers = userIds.filter((id) => !memberUsers.has(id));
    if (!missingUsers.length) return;

    const groupMemberships = await userGroupMembershipDAL.find({ $in: { userId: missingUsers } }, { tx });
    const groupsInAgentVault = groupMemberships.length
      ? await membershipDAL.find(
          {
            scope: AccessScope.Project,
            scopeProjectId: projectId,
            $in: { actorGroupId: [...new Set(groupMemberships.map((row) => row.groupId))] }
          },
          { tx }
        )
      : [];
    const memberGroupIds = new Set(groupsInAgentVault.map((row) => row.actorGroupId));
    const throughGroup = new Set(
      groupMemberships.filter((row) => memberGroupIds.has(row.groupId)).map((row) => row.userId)
    );

    // Both reasons in one message, so a batch that holds both is fixed in one round trip.
    const viaGroup = missingUsers.filter((id) => throughGroup.has(id));
    const strangers = missingUsers.filter((id) => !throughGroup.has(id));
    const reasons: string[] = [];
    if (viaGroup.length) {
      reasons.push(
        `User(s) ${quoted(viaGroup)} are in Agent Vault through a group. Name the group instead, or add them directly under Access Control first.`
      );
    }
    if (strangers.length) {
      reasons.push(`User(s) ${quoted(strangers)} are not members of Agent Vault. Add them under Access Control first.`);
    }
    throw new BadRequestError({ message: reasons.join(" ") });
  };

  // Users and the identity go through the same reachability as mint, so the view can't disagree with what mint allows.
  const reachOf = async ({
    projectId,
    orgId,
    actor
  }: {
    projectId: string;
    orgId: string;
    actor: { type: ActorType.USER | ActorType.IDENTITY; id: string };
  }) => {
    try {
      const { accessBundleIds } = await getAgentVaultReachability(
        { permissionService, membershipDAL },
        { projectId, ctx: { actor: actor.type, actorId: actor.id, actorOrgId: orgId, actorAuthMethod: null } }
      );
      return accessBundleIds;
    } catch (error) {
      if (error instanceof ForbiddenRequestError && error.name === "ProjectMembershipNotFound") return [];
      throw error;
    }
  };

  // A group reaches nothing without a live Agent Vault role, every bundle with the admin role, and otherwise the
  // bundles granted to it, which is what a group's grants add to its members' reach.
  const groupReachOf = async ({ projectId, groupIds }: { projectId: string; groupIds: string[] }) => {
    const reaches = new Map<string, string[] | null>();
    if (!groupIds.length) return reaches;

    const [memberships, grants] = await Promise.all([
      membershipDAL.find({ scope: AccessScope.Project, scopeProjectId: projectId, $in: { actorGroupId: groupIds } }),
      membershipDAL.find({
        scope: RESOURCE_SCOPE,
        scopeProjectId: projectId,
        scopeResourceType: ResourceType.AgentVaultAccessBundle,
        $in: { actorGroupId: groupIds }
      })
    ]);
    const roles = memberships.length
      ? await membershipRoleDAL.find({ $in: { membershipId: memberships.map((membership) => membership.id) } })
      : [];

    groupIds.forEach((groupId) => {
      const membershipIds = new Set(
        memberships.filter((m) => m.actorGroupId === groupId && m.isActive).map((membership) => membership.id)
      );
      const liveRoles = roles.filter((role) => membershipIds.has(role.membershipId) && isActiveRole(role));
      if (!liveRoles.length) {
        reaches.set(groupId, []);
      } else if (liveRoles.some((role) => role.role === ProjectMembershipRole.Admin)) {
        reaches.set(groupId, null);
      } else {
        reaches.set(
          groupId,
          grants
            .filter((grant) => grant.actorGroupId === groupId && grant.isActive)
            .map((grant) => grant.scopeResourceId!)
        );
      }
    });
    return reaches;
  };

  // A session on a user's behalf can use only the bundles both the user and the identity reach, so these are the
  // bundles the identity can't act on for each user and group it covers. All-members covers Agent Vault admins, who
  // reach every bundle, so there it is every bundle the identity can't reach.
  const withMissingAccessBundles = async ({
    projectId,
    ctx,
    delegation
  }: {
    projectId: string;
    ctx: TGenericPermission;
    delegation: TAgentVaultDelegationView;
  }) => {
    const identityReach = await reachOf({
      projectId,
      orgId: ctx.actorOrgId,
      actor: { type: ActorType.IDENTITY, id: delegation.machineIdentity.id }
    });
    const lacking: TMissingAccessBundle[] =
      identityReach === null
        ? []
        : (await agentVaultAccessBundleDAL.find({ projectId }, { sort: [["name", "asc"]] }))
            .filter((bundle) => !identityReach.includes(bundle.id))
            .map((bundle) => ({ id: bundle.id, name: bundle.name }));
    const missingFrom = (reach: string[] | null) =>
      reach === null ? lacking : lacking.filter((bundle) => reach.includes(bundle.id));

    const [userReaches, groupReaches] = lacking.length
      ? await Promise.all([
          Promise.all(
            delegation.users.map((user) =>
              reachOf({ projectId, orgId: ctx.actorOrgId, actor: { type: ActorType.USER, id: user.id } })
            )
          ),
          groupReachOf({ projectId, groupIds: delegation.groups.map((group) => group.id) })
        ])
      : [[], new Map<string, string[] | null>()];

    // Each reach ran getProjectPermission for someone else, and the audit log reads the caller's permission metadata
    // from the request context. Running the caller's check again, memoized so it costs no query, puts it back.
    await getAgentVaultPermission({ permissionService }, { projectId, ctx });

    const users = delegation.users.map((user, index) => ({
      ...user,
      missingAccessBundles: lacking.length ? missingFrom(userReaches[index]) : []
    }));
    const groups = delegation.groups.map((group) => {
      // A null reach is every bundle, so it can't fall back with ??.
      const reach = groupReaches.get(group.id);
      return { ...group, missingAccessBundles: reach === undefined ? [] : missingFrom(reach) };
    });
    const missingIds = new Set([...users, ...groups].flatMap((s) => s.missingAccessBundles.map((bundle) => bundle.id)));
    const missingAccessBundles =
      delegation.scope === AgentVaultDelegationScope.AllMembers
        ? lacking
        : lacking.filter((bundle) => missingIds.has(bundle.id));

    return { ...toDelegation(delegation), users, groups, missingAccessBundles };
  };

  const listDelegations = async ({ projectId, ctx, machineIdentityIds, limit, offset }: TListDelegationsDTO) => {
    await checkIdentityPermission({ projectId, ctx }, ProjectPermissionIdentityActions.Read);
    const { delegations, totalCount } = await agentVaultDelegationDAL.findViews({
      projectId,
      identityIds: machineIdentityIds,
      limit,
      offset
    });
    return { delegations: delegations.map(toDelegation), totalCount };
  };

  // An identity may read its own, so an orchestrator can check what it was allowed before it acts.
  const getDelegation = async ({ projectId, ctx, machineIdentityId }: TGetDelegationDTO) => {
    const { permission, isAdmin } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    const isSelf = ctx.actor === ActorType.IDENTITY && ctx.actorId === machineIdentityId;
    if (!isSelf) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Read,
        subject(ProjectPermissionSub.Identity, { identityId: machineIdentityId })
      );
    }

    const {
      delegations: [delegation]
    } = await agentVaultDelegationDAL.findViews({ projectId, identityIds: [machineIdentityId] });
    if (!delegation) throw notFound(machineIdentityId);
    // The missing bundles were never granted to the identity, so reading its own delegation can't reveal them.
    if (!isAdmin) return { delegation: withNoMissingAccessBundles(delegation) };
    return { delegation: await withMissingAccessBundles({ projectId, ctx, delegation }) };
  };

  const setDelegation = async ({ projectId, ctx, machineIdentityId, scope, userIds, groupIds }: TSetDelegationDTO) => {
    await checkIdentityPermission({ projectId, ctx, machineIdentityId }, ProjectPermissionIdentityActions.Edit);

    // A write replaces the whole list, so a subject left out is no longer covered.
    const wantedUserIds = scope === AgentVaultDelegationScope.Selected ? userIds : [];
    const wantedGroupIds = scope === AgentVaultDelegationScope.Selected ? groupIds : [];

    const delegation = await agentVaultDelegationDAL.transaction(async (tx) => {
      // Before the delegation row, the order a removal from Agent Vault takes them in, so a save and a removal can't
      // each hold a lock the other waits for.
      const memberships = await agentVaultDelegationDAL.lockMemberships(
        { projectId, identityId: machineIdentityId, userIds: wantedUserIds, groupIds: wantedGroupIds },
        tx
      );
      // Project-scoped, so an identity from another org is a 404 like one that doesn't exist.
      const identityMembership = memberships.find((row) => row.actorIdentityId === machineIdentityId);
      if (!identityMembership) {
        throw new NotFoundError({
          message: `Machine identity with ID '${machineIdentityId}' is not a member of Agent Vault. Add it under Access Control first.`
        });
      }
      await assertSubjectsInAgentVault(
        { projectId, userIds: wantedUserIds, groupIds: wantedGroupIds, memberships },
        tx
      );

      const row = await agentVaultDelegationDAL.upsertScope(
        { projectId, identityId: machineIdentityId, membershipId: identityMembership.id, scope },
        tx
      );

      const wantedMembershipIds = new Set(
        memberships
          .filter(
            (membership) =>
              (membership.actorUserId && wantedUserIds.includes(membership.actorUserId)) ||
              (membership.actorGroupId && wantedGroupIds.includes(membership.actorGroupId))
          )
          .map((membership) => membership.id)
      );
      // Rows that stay are kept rather than rewritten, so each one's addedAt still says when it was added.
      const existing = await agentVaultDelegationSubjectDAL.find({ delegationId: row.id }, { tx });
      const stale = existing.filter((named) => !wantedMembershipIds.has(named.membershipId));
      if (stale.length) {
        await agentVaultDelegationSubjectDAL.delete({ $in: { id: stale.map((named) => named.id) } }, tx);
      }
      const keptMembershipIds = new Set(existing.map((named) => named.membershipId));
      const added = [...wantedMembershipIds]
        .filter((membershipId) => !keptMembershipIds.has(membershipId))
        .map((membershipId) => ({ delegationId: row.id, membershipId }));
      if (added.length) await agentVaultDelegationSubjectDAL.insertMany(added, tx);

      const {
        delegations: [written]
      } = await agentVaultDelegationDAL.findViews({ projectId, identityIds: [machineIdentityId] }, tx);
      return written;
    });

    // After the commit: reading every covered user's reach is many queries, none of which belong in the transaction.
    return { delegation: await withMissingAccessBundles({ projectId, ctx, delegation }) };
  };

  const deleteDelegation = async ({ projectId, ctx, machineIdentityId }: TDeleteDelegationDTO) => {
    await checkIdentityPermission({ projectId, ctx, machineIdentityId }, ProjectPermissionIdentityActions.Edit);

    const deleted = await agentVaultDelegationDAL.transaction(async (tx) => {
      const {
        delegations: [delegation]
      } = await agentVaultDelegationDAL.findViews({ projectId, identityIds: [machineIdentityId] }, tx);
      if (!delegation) return undefined;

      // Two concurrent deletes both read it; only the one whose delete removed the row reports it, so the audit
      // trail holds a single deletion.
      const removed = await agentVaultDelegationDAL.delete({ id: delegation.id }, tx);
      return removed.length ? delegation : undefined;
    });
    if (!deleted) throw notFound(machineIdentityId);

    return { delegation: toDelegation(deleted) };
  };

  return { listDelegations, getDelegation, setDelegation, deleteDelegation };
};
