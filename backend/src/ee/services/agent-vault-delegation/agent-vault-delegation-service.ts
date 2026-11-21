import { createMongoAbility, ForbiddenError, subject } from "@casl/ability";
import { Knex } from "knex";

import { AccessScope, ProjectType, TMemberships } from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { isActiveRole } from "@app/ee/services/permission/permission-fns";
import { buildProjectPermissionRules } from "@app/ee/services/permission/permission-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { conditionsMatcher } from "@app/lib/casl";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TGenericPermission } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TRoleDALFactory } from "@app/services/role/role-dal";

import { TAgentVaultAccessBundleDALFactory } from "../agent-vault-access-bundle/agent-vault-access-bundle-dal";
import { TAgentVaultMemberDALFactory } from "../agent-vault-member/agent-vault-member-dal";
import { AgentVaultDelegationScope, AgentVaultMemberType } from "../agent-vault/agent-vault-enums";
import {
  getAgentVaultPermission,
  getAgentVaultReachability,
  intersectIds,
  reachOf as reachOfPermission,
  readableIdentityIdsOf,
  TAgentVaultPermission
} from "../agent-vault/agent-vault-permission";
import { TAgentVaultReachDALFactory } from "../agent-vault/agent-vault-reach-dal";
import {
  TAgentVaultDelegationDALFactory,
  TAgentVaultDelegationSubjectDALFactory,
  TAgentVaultDelegationView
} from "./agent-vault-delegation-dal";
import {
  TChangeDelegationSubjectsDTO,
  TDeleteDelegationDTO,
  TGetDelegationDTO,
  TListAvailableDelegationSubjectsDTO,
  TListDelegationsDTO,
  TSetDelegationDTO
} from "./agent-vault-delegation-types";

type TAgentVaultDelegationServiceFactoryDep = {
  agentVaultDelegationDAL: Pick<
    TAgentVaultDelegationDALFactory,
    | "upsertScope"
    | "insertSelectedIfMissing"
    | "markChanged"
    | "insertSubjectsSkippingNamed"
    | "deleteIfNamesNoOne"
    | "lockForIdentity"
    | "removeSubjectsByActors"
    | "findViews"
    | "findIdentityIds"
    | "findForIdentity"
    | "delete"
    | "transaction"
    | "lockMemberships"
  >;
  agentVaultDelegationSubjectDAL: Pick<TAgentVaultDelegationSubjectDALFactory, "find" | "delete" | "insertMany">;
  agentVaultAccessBundleDAL: Pick<TAgentVaultAccessBundleDALFactory, "find">;
  agentVaultMemberDAL: Pick<TAgentVaultMemberDALFactory, "findProductMembers">;
  membershipDAL: Pick<TMembershipDALFactory, "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
  roleDAL: Pick<TRoleDALFactory, "find">;
  agentVaultReachDAL: Pick<TAgentVaultReachDALFactory, "findAccessBundleIds" | "findServiceIds" | "findSkillIds">;
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

const canReadUsers = (permission: TAgentVaultPermission["permission"]) =>
  permission.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member);

const canReadGroups = (permission: TAgentVaultPermission["permission"]) =>
  permission.can(ProjectPermissionGroupActions.Read, ProjectPermissionSub.Groups);

// The users a delegation covers show only to someone who can read members, and its groups only to someone who can read
// groups, as in the member lists. The machine identity itself sees whom it acts for, so an orchestrator can check
// before it acts.
const withReadableSubjects = <T extends { machineIdentity: { id: string }; users: unknown[]; groups: unknown[] }>(
  permission: TAgentVaultPermission["permission"],
  ctx: TGenericPermission,
  delegation: T
): T => {
  if (ctx.actor === ActorType.IDENTITY && ctx.actorId === delegation.machineIdentity.id) return delegation;
  return {
    ...delegation,
    users: canReadUsers(permission) ? delegation.users : [],
    groups: canReadGroups(permission) ? delegation.groups : []
  };
};

type TLockedMembership = Pick<TMemberships, "id" | "actorIdentityId" | "actorUserId" | "actorGroupId">;

// The Agent Vault memberships of the named users and groups, which is what a delegation's subject rows reference.
const membershipIdsNaming = (memberships: TLockedMembership[], userIds: string[], groupIds: string[]) =>
  memberships
    .filter(
      (membership) =>
        (membership.actorUserId && userIds.includes(membership.actorUserId)) ||
        (membership.actorGroupId && groupIds.includes(membership.actorGroupId))
    )
    .map((membership) => membership.id);

export const agentVaultDelegationServiceFactory = ({
  agentVaultDelegationDAL,
  agentVaultDelegationSubjectDAL,
  agentVaultAccessBundleDAL,
  agentVaultMemberDAL,
  membershipDAL,
  membershipRoleDAL,
  roleDAL,
  agentVaultReachDAL,
  userGroupMembershipDAL,
  permissionService
}: TAgentVaultDelegationServiceFactoryDep) => {
  // A delegation says whom an identity can act as, so managing one is managing the identity. Changing one also takes
  // manage-delegations on sessions: a delegation's sessions send the covered users' personal values, which editing an
  // identity alone must not reach.
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
    if (action !== ProjectPermissionIdentityActions.Read) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionAgentVaultSessionActions.ManageDelegations,
        ProjectPermissionSub.AgentVaultSessions
      );
    }
    return permission;
  };

  // Project-scoped, so an identity from another org is a 404 like one that doesn't exist.
  const notInAgentVault = (machineIdentityId: string) =>
    new NotFoundError({
      message: `Machine identity with ID '${machineIdentityId}' is not a member of this Agent Vault project. Add it under Access Control first.`
    });
  const requireIdentityMembership = (memberships: TLockedMembership[], machineIdentityId: string) => {
    const identityMembership = memberships.find((row) => row.actorIdentityId === machineIdentityId);
    if (!identityMembership) throw notInAgentVault(machineIdentityId);
    return identityMembership;
  };

  // Removing the identity from Agent Vault deletes its membership, then cascades to the delegation and its subjects.
  // A write that changes only the delegation still takes the membership first, so the two lock in the same order.
  const lockIdentityMembership = async (projectId: string, machineIdentityId: string, tx: Knex) =>
    requireIdentityMembership(
      await agentVaultDelegationDAL.lockMemberships(
        { projectId, identityId: machineIdentityId, userIds: [], groupIds: [] },
        tx
      ),
      machineIdentityId
    );

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
        message: `Group(s) ${quoted(missingGroups)} are not members of this Agent Vault project. Add them under Access Control first.`
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
        `User(s) ${quoted(viaGroup)} are in this project through a group. Name the group instead, or add them directly under Access Control first.`
      );
    }
    if (strangers.length) {
      reasons.push(
        `User(s) ${quoted(strangers)} are not members of this Agent Vault project. Add them under Access Control first.`
      );
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
        { permissionService, agentVaultReachDAL },
        { projectId, ctx: { actor: actor.type, actorId: actor.id, actorOrgId: orgId, actorAuthMethod: null } }
      );
      return accessBundleIds;
    } catch (error) {
      if (error instanceof ForbiddenRequestError && error.name === "ProjectMembershipNotFound") return [];
      throw error;
    }
  };

  // The bundles a group's live roles let it use, which is what the group adds to its members' reach. Built from the
  // roles the way an actor's permission is, since a group has no permission of its own to load.
  const groupReachOf = async ({ projectId, groupIds }: { projectId: string; groupIds: string[] }) => {
    const reaches = new Map<string, string[] | null>();
    if (!groupIds.length) return reaches;

    const memberships = await membershipDAL.find({
      scope: AccessScope.Project,
      scopeProjectId: projectId,
      $in: { actorGroupId: groupIds }
    });
    const roles = memberships.length
      ? await membershipRoleDAL.find({ $in: { membershipId: memberships.map((membership) => membership.id) } })
      : [];
    const customRoleIds = [...new Set(roles.flatMap((role) => (role.customRoleId ? [role.customRoleId] : [])))];
    const customRoles = customRoleIds.length ? await roleDAL.find({ $in: { id: customRoleIds } }) : [];

    await Promise.all(
      groupIds.map(async (groupId) => {
        const membershipIds = new Set(
          memberships.filter((m) => m.actorGroupId === groupId && m.isActive).map((membership) => membership.id)
        );
        const liveRoles = roles.filter((role) => membershipIds.has(role.membershipId) && isActiveRole(role));
        const ability = createMongoAbility<ProjectPermissionSet>(
          buildProjectPermissionRules(
            liveRoles.map((role) => ({
              role: role.role,
              permissions: customRoles.find((custom) => custom.id === role.customRoleId)?.permissions ?? []
            })),
            ProjectType.AgentVault
          ),
          { conditionsMatcher }
        );
        const { accessBundleIds } = await reachOfPermission(ability, { agentVaultReachDAL }, projectId);
        reaches.set(groupId, accessBundleIds);
      })
    );
    return reaches;
  };

  // A session on a user's behalf can use only the bundles both the user and the identity reach, so these are the
  // bundles the identity can't act on for each user and group it covers. All-members covers Agent Vault admins, who
  // reach every bundle, so there it is every bundle the identity can't reach.
  const withMissingAccessBundles = async ({
    projectId,
    ctx,
    delegation,
    permission
  }: {
    projectId: string;
    ctx: TGenericPermission;
    delegation: TAgentVaultDelegationView;
    // The caller's, when it is already loaded. Only the bundles it lets them see are listed.
    permission?: Awaited<ReturnType<typeof getAgentVaultPermission>>["permission"];
  }) => {
    const callerPermission =
      permission ?? (await getAgentVaultPermission({ permissionService }, { projectId, ctx })).permission;
    const identityReach = await reachOf({
      projectId,
      orgId: ctx.actorOrgId,
      actor: { type: ActorType.IDENTITY, id: delegation.machineIdentity.id }
    });
    const lacking: TMissingAccessBundle[] =
      identityReach === null
        ? []
        : (await agentVaultAccessBundleDAL.find({ projectId }, { sort: [["name", "asc"]] }))
            .filter(
              (bundle) =>
                !identityReach.includes(bundle.id) &&
                (callerPermission.can(
                  ProjectPermissionAgentVaultAccessBundleActions.Read,
                  subject(ProjectPermissionSub.AgentVaultAccessBundles, { accessBundleId: bundle.id })
                ) ||
                  callerPermission.can(
                    ProjectPermissionAgentVaultAccessBundleActions.Use,
                    subject(ProjectPermissionSub.AgentVaultAccessBundles, { accessBundleId: bundle.id })
                  ))
            )
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

    return withReadableSubjects(callerPermission, ctx, {
      ...toDelegation(delegation),
      users,
      groups,
      missingAccessBundles
    });
  };

  // For a response built from a delegation the audit log records in full.
  const hideUnreadableSubjects = async ({
    projectId,
    ctx,
    delegation
  }: {
    projectId: string;
    ctx: TGenericPermission;
    delegation: ReturnType<typeof toDelegation>;
  }) => {
    const { permission } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    return withReadableSubjects(permission, ctx, delegation);
  };

  // Only the delegations of machine identities the caller can read, narrowed in the query so the page and its count
  // agree.
  const listDelegations = async ({ projectId, ctx, machineIdentityIds, limit, offset }: TListDelegationsDTO) => {
    const permission = await checkIdentityPermission({ projectId, ctx }, ProjectPermissionIdentityActions.Read);
    const readableIds = await readableIdentityIdsOf(permission, () =>
      agentVaultDelegationDAL.findIdentityIds(projectId)
    );
    const { delegations, totalCount } = await agentVaultDelegationDAL.findViews({
      projectId,
      identityIds: intersectIds(machineIdentityIds ?? null, readableIds) ?? undefined,
      limit,
      offset
    });
    return {
      delegations: delegations.map((delegation) => withReadableSubjects(permission, ctx, toDelegation(delegation))),
      totalCount
    };
  };

  // An identity may read its own, so an orchestrator can check what it was allowed before it acts.
  const getDelegation = async ({ projectId, ctx, machineIdentityId }: TGetDelegationDTO) => {
    const { permission } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
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
    // The missing bundles are ones the identity can't use, so reading its own delegation can't reveal them. Only someone
    // who can read bundles gets them, and only the ones they can see.
    if (
      permission.cannot(
        ProjectPermissionAgentVaultAccessBundleActions.Read,
        ProjectPermissionSub.AgentVaultAccessBundles
      )
    ) {
      return { delegation: withReadableSubjects(permission, ctx, withNoMissingAccessBundles(delegation)) };
    }
    return { delegation: await withMissingAccessBundles({ projectId, ctx, delegation, permission }) };
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
      const identityMembership = requireIdentityMembership(memberships, machineIdentityId);
      await assertSubjectsInAgentVault(
        { projectId, userIds: wantedUserIds, groupIds: wantedGroupIds, memberships },
        tx
      );

      // Locked first, so a remove of the last subject still in flight is waited for and its emptied row replaced.
      await agentVaultDelegationDAL.lockForIdentity({ projectId, identityId: machineIdentityId }, tx);
      await agentVaultDelegationDAL.deleteIfNamesNoOne({ projectId, identityId: machineIdentityId }, tx);
      const row = await agentVaultDelegationDAL.upsertScope(
        { projectId, identityId: machineIdentityId, membershipId: identityMembership.id, scope },
        tx
      );

      const wantedMembershipIds = new Set(membershipIdsNaming(memberships, wantedUserIds, wantedGroupIds));
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

    // The missing bundles are left to the caller, through withMissingAccessBundles: reading every covered user's reach
    // is many queries, none of which belong in the transaction, and a failure there mustn't stop the save from being
    // audited.
    return { delegation };
  };

  // Adds to what the delegation already names rather than replacing it, so a client that never saw the current list
  // can't overwrite it. Creates a selected delegation if the identity has none.
  const addDelegationSubjects = async ({
    projectId,
    ctx,
    machineIdentityId,
    userIds,
    groupIds
  }: TChangeDelegationSubjectsDTO) => {
    await checkIdentityPermission({ projectId, ctx, machineIdentityId }, ProjectPermissionIdentityActions.Edit);

    const refuseAllMembers = (scope?: string) => {
      if (scope === AgentVaultDelegationScope.AllMembers) {
        throw new BadRequestError({
          message: `Machine identity with ID '${machineIdentityId}' already acts on behalf of every project member. To name users and groups instead, set its scope to selected.`
        });
      }
    };

    const { delegation, isChanged } = await agentVaultDelegationDAL.transaction(async (tx) => {
      // The same order a save takes them in: memberships, then the delegation row.
      const memberships = await agentVaultDelegationDAL.lockMemberships(
        { projectId, identityId: machineIdentityId, userIds, groupIds },
        tx
      );
      const identityMembership = requireIdentityMembership(memberships, machineIdentityId);
      await assertSubjectsInAgentVault({ projectId, userIds, groupIds, memberships }, tx);

      const current = await agentVaultDelegationDAL.lockForIdentity({ projectId, identityId: machineIdentityId }, tx);
      refuseAllMembers(current?.scope);

      await agentVaultDelegationDAL.deleteIfNamesNoOne({ projectId, identityId: machineIdentityId }, tx);
      await agentVaultDelegationDAL.insertSelectedIfMissing(
        { projectId, identityId: machineIdentityId, membershipId: identityMembership.id },
        tx
      );
      // With no row there was nothing to lock above, so a save can have created one since: locked and checked again.
      const row = await agentVaultDelegationDAL.lockForIdentity({ projectId, identityId: machineIdentityId }, tx);
      if (!row) throw notFound(machineIdentityId);
      refuseAllMembers(row.scope);

      const added = await agentVaultDelegationDAL.insertSubjectsSkippingNamed(
        { delegationId: row.id, membershipIds: membershipIdsNaming(memberships, userIds, groupIds) },
        tx
      );
      if (added) await agentVaultDelegationDAL.markChanged(row.id, tx);
      // Read in the transaction because the replica may not have the write yet.
      const {
        delegations: [written]
      } = await agentVaultDelegationDAL.findViews({ projectId, identityIds: [machineIdentityId] }, tx);
      return { delegation: written, isChanged: added > 0 };
    });

    // isChanged lets the caller audit only a real change: naming users and groups already in it writes nothing.
    return { delegation, isChanged };
  };

  // Names the delegation doesn't hold are skipped. Taking out the last one leaves a delegation that names no one, which
  // reads as none, so the result is null.
  const removeDelegationSubjects = async ({
    projectId,
    ctx,
    machineIdentityId,
    userIds,
    groupIds
  }: TChangeDelegationSubjectsDTO) => {
    await checkIdentityPermission({ projectId, ctx, machineIdentityId }, ProjectPermissionIdentityActions.Edit);

    const changed = await agentVaultDelegationDAL.transaction(async (tx) => {
      await lockIdentityMembership(projectId, machineIdentityId, tx);
      const current = await agentVaultDelegationDAL.lockForIdentity({ projectId, identityId: machineIdentityId }, tx);
      const viewNow = async () =>
        (await agentVaultDelegationDAL.findViews({ projectId, identityIds: [machineIdentityId] }, tx)).delegations[0];
      const before = current ? await viewNow() : undefined;
      if (!current || !before) return undefined;
      if (current.scope === AgentVaultDelegationScope.AllMembers) {
        throw new BadRequestError({
          message: `Machine identity with ID '${machineIdentityId}' acts on behalf of every project member, so it names no users or groups to remove.`
        });
      }

      const removed = await agentVaultDelegationDAL.removeSubjectsByActors(
        { delegationId: current.id, userIds, groupIds },
        tx
      );
      if (removed) await agentVaultDelegationDAL.markChanged(current.id, tx);
      return { before, after: (await viewNow()) ?? null, isChanged: removed > 0 };
    });
    if (!changed) throw notFound(machineIdentityId);

    return { delegation: changed.after, previous: changed.before, isChanged: changed.isChanged };
  };

  const listAvailableDelegationSubjects = async ({
    projectId,
    ctx,
    machineIdentityId,
    actorType,
    search,
    limit,
    offset
  }: TListAvailableDelegationSubjectsDTO) => {
    // The list is for adding to the delegation, so it takes what adding takes, and lists only the kinds of member the
    // caller can read.
    const permission = await checkIdentityPermission(
      { projectId, ctx, machineIdentityId },
      ProjectPermissionIdentityActions.Edit
    );
    const asked = actorType ? [actorType] : [AgentVaultMemberType.User, AgentVaultMemberType.Group];
    const readable = asked.filter((type) =>
      type === AgentVaultMemberType.User ? canReadUsers(permission) : canReadGroups(permission)
    );
    if (!readable.length) {
      if (asked[0] === AgentVaultMemberType.User) {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionMemberActions.Read,
          ProjectPermissionSub.Member
        );
      }
      ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionGroupActions.Read, ProjectPermissionSub.Groups);
    }

    const [identityMembership] = await membershipDAL.find({
      scope: AccessScope.Project,
      scopeProjectId: projectId,
      actorIdentityId: machineIdentityId
    });
    if (!identityMembership) throw notInAgentVault(machineIdentityId);

    const delegation = await agentVaultDelegationDAL.findForIdentity({ projectId, identityId: machineIdentityId });
    return agentVaultMemberDAL.findProductMembers({
      projectId,
      orgId: ctx.actorOrgId,
      actorTypes: readable,
      search,
      limit,
      offset,
      excludeDelegationId: delegation?.id
    });
  };

  const deleteDelegation = async ({ projectId, ctx, machineIdentityId }: TDeleteDelegationDTO) => {
    await checkIdentityPermission({ projectId, ctx, machineIdentityId }, ProjectPermissionIdentityActions.Edit);

    const deleted = await agentVaultDelegationDAL.transaction(async (tx) => {
      await lockIdentityMembership(projectId, machineIdentityId, tx);
      // Locked before the read, so the audit entry lists exactly who the delete removed.
      await agentVaultDelegationDAL.lockForIdentity({ projectId, identityId: machineIdentityId }, tx);
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

  return {
    listDelegations,
    getDelegation,
    setDelegation,
    addDelegationSubjects,
    removeDelegationSubjects,
    listAvailableDelegationSubjects,
    withMissingAccessBundles,
    hideUnreadableSubjects,
    deleteDelegation
  };
};
