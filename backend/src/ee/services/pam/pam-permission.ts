import { createMongoAbility, ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, packRules } from "@casl/ability/extra";
import { Knex } from "knex";

import { ProjectType, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import {
  PamResourcePermissionActions,
  PamResourcePermissionSet,
  PamResourcePermissionSub,
  pamResourceRoles,
  TPamDomain
} from "@app/domains/pam/pam/ce/module";
import { isActiveRole } from "@app/domains/platform/access-control/ce/module";
import { TProjectsDomain } from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { ForbiddenRequestError } from "@app/lib/errors";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";

const pamRoleHasAction = (role: string, action: PamResourcePermissionActions): boolean => {
  try {
    const rules = pamResourceRoles.resolveRole(role);
    const ability = createMongoAbility(rules);
    return ability.can(action, PamResourcePermissionSub.PamResource);
  } catch {
    return false;
  }
};

type TPamDep = Pick<TPamDomain, "getPamPermission">;
type TProjectsDep = Pick<TProjectsDomain, "getProjectPermission">;
type TMembershipDep = Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
type TBatchMembershipDep = Pick<TMembershipDALFactory, "findResourceMembershipsForActors">;
type TMembershipRoleDep = Pick<TMembershipRoleDALFactory, "find">;

type TPamActionFilter = {
  allOf?: PamResourcePermissionActions[];
  anyOf?: PamResourcePermissionActions[];
};

type TPamActor = { type: ActorType.USER | ActorType.IDENTITY; id: string };

// Users and identities live in separate columns everywhere, so a map keyed by id alone would cross the two.
export const pamActorKey = ({ type, id }: TPamActor) => `${type}:${id}`;

const roleMatchesActions = (role: string, actions: TPamActionFilter) => {
  if (actions.allOf && !actions.allOf.every((a) => pamRoleHasAction(role, a))) return false;
  if (actions.anyOf && !actions.anyOf.some((a) => pamRoleHasAction(role, a))) return false;
  return true;
};

const activeRoleByMembershipId = (roles: Awaited<ReturnType<TMembershipRoleDALFactory["find"]>>) => {
  const now = new Date();
  return new Map(
    roles
      .filter((r) => !r.isTemporary || (r.temporaryAccessEndTime && now < new Date(r.temporaryAccessEndTime)))
      .map((r) => [r.membershipId, r.role])
  );
};

export const verifyProductMembership = (projectsDomain: TProjectsDep, projectId: string, ctx: TActorContext) =>
  projectsDomain.getProjectPermission({ actor: ctx, projectId, type: ProjectType.PAM });

export const checkFolderPermission = (pamDomain: TPamDep, folderId: string, projectId: string, ctx: TActorContext) =>
  pamDomain.getPamPermission({ actor: ctx, projectId, folderId });

// The folder's roles and the account's count together. A folder member the folder does not give the action, with no
// role on the account, is refused as a non-member of the account, as when the account was checked on its own.
export const checkAccountAccess = async (
  pamDomain: TPamDep,
  accountId: string,
  folderId: string | null | undefined,
  projectId: string,
  action: PamResourcePermissionActions,
  ctx: TActorContext
) => {
  const permission = await pamDomain.getPamPermission({ actor: ctx, projectId, folderId, accountId });
  const check = { action, subject: PamResourcePermissionSub.PamResource };
  const { memberships } = permission;
  if (
    folderId &&
    !permission.isProjectAdmin &&
    memberships.length > 0 &&
    memberships.every((membership) => membership.resourceId !== accountId) &&
    permission.cannot(check)
  ) {
    throw new ForbiddenRequestError({ message: `You are not a member of this ${ResourceType.PamAccount}.` });
  }
  permission.assert(check);
};

const findActivePamMemberships = async (
  membershipDAL: TMembershipDep,
  membershipRoleDAL: TMembershipRoleDep,
  projectId: string,
  actor: { type: ActorType; id: string },
  tx?: Knex,
  isRelevant: (membership: { scopeResourceId?: string | null }) => boolean = () => true
) => {
  const [folderMemberships, accountMemberships] = await Promise.all([
    membershipDAL.findResourceMembershipsForActor(
      {
        projectId,
        resourceType: ResourceType.PamFolder,
        actorType: actor.type,
        actorId: actor.id
      },
      tx
    ),
    membershipDAL.findResourceMembershipsForActor(
      {
        projectId,
        resourceType: ResourceType.PamAccount,
        actorType: actor.type,
        actorId: actor.id
      },
      tx
    )
  ]);

  const activeFolderMemberships = folderMemberships.filter((m) => m.isActive && isRelevant(m));
  const activeAccountMemberships = accountMemberships.filter((m) => m.isActive && isRelevant(m));

  const allMemberships = [...activeFolderMemberships, ...activeAccountMemberships];
  const roles = allMemberships.length
    ? await membershipRoleDAL.find({ $in: { membershipId: allMemberships.map((m) => m.id) } }, { tx })
    : [];

  return { folderMemberships: activeFolderMemberships, accountMemberships: activeAccountMemberships, roles };
};

// How long the actor keeps LaunchSessions on the account: null while a granting role is permanent, 0 once none
// grants it.
export const getLaunchAccessRemainingMs = async (
  membershipDAL: TMembershipDep,
  membershipRoleDAL: TMembershipRoleDep,
  projectId: string,
  account: { id: string; folderId?: string | null },
  actor: { type: ActorType; id: string }
): Promise<number | null> => {
  const { folderMemberships, accountMemberships, roles } = await findActivePamMemberships(
    membershipDAL,
    membershipRoleDAL,
    projectId,
    actor,
    undefined,
    (m) => m.scopeResourceId === account.id || (Boolean(account.folderId) && m.scopeResourceId === account.folderId)
  );
  const membershipIds = new Set(
    [
      ...folderMemberships.filter((m) => m.scopeResourceId === account.folderId),
      ...accountMemberships.filter((m) => m.scopeResourceId === account.id)
    ].map((m) => m.id)
  );
  if (membershipIds.size === 0) return 0;

  const grantingRoles = roles.filter(
    (r) => isActiveRole(r) && pamRoleHasAction(r.role, PamResourcePermissionActions.LaunchSessions)
  );
  if (grantingRoles.some((r) => !r.isTemporary)) return null;

  const endsAt = Math.max(0, ...grantingRoles.map((r) => new Date(r.temporaryAccessEndTime ?? 0).getTime()));
  return Math.max(0, endsAt - Date.now());
};

// Non-throwing counterpart to checkAccountAccess, for deciding what a caller may do.
export const accountAccessAllows = async (
  pamDomain: TPamDep,
  accountId: string,
  folderId: string | null | undefined,
  projectId: string,
  action: PamResourcePermissionActions,
  ctx: TActorContext
): Promise<boolean> => {
  try {
    await checkAccountAccess(pamDomain, accountId, folderId, projectId, action, ctx);
    return true;
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof ForbiddenRequestError) return false;
    throw err;
  }
};

// `tx` is for callers that must see their own uncommitted membership writes (revoking access and closing
// the sessions it was holding open, in one transaction). Without it these are replica reads.
export const getResourceIdsWithActions = async (
  membershipDAL: TMembershipDep,
  membershipRoleDAL: TMembershipRoleDep,
  projectId: string,
  actions: TPamActionFilter,
  ctx: TActorContext,
  tx?: Knex
) => {
  const {
    folderMemberships: activeFolderMemberships,
    accountMemberships: activeAccountMemberships,
    roles
  } = await findActivePamMemberships(
    membershipDAL,
    membershipRoleDAL,
    projectId,
    { type: ctx.principal.type, id: ctx.principal.id },
    tx
  );
  const roleByMembershipId = activeRoleByMembershipId(roles);

  const folderIds = activeFolderMemberships
    .filter((m) => {
      const role = roleByMembershipId.get(m.id);
      return m.scopeResourceId && role && roleMatchesActions(role, actions);
    })
    .map((m) => m.scopeResourceId!);

  const accountIds = activeAccountMemberships
    .filter((m) => {
      const role = roleByMembershipId.get(m.id);
      return m.scopeResourceId && role && roleMatchesActions(role, actions);
    })
    .map((m) => m.scopeResourceId!);

  return { folderIds, accountIds };
};

// Batched form of getResourceIdsWithActions, keyed by `pamActorKey`: same merge, but a fixed number of
// queries for any number of actors. Callers are bulk re-checks that run inside a transaction, where a
// per-actor loop would pin its connection for the whole set.
export const getResourceIdsWithActionsForActors = async (
  membershipDAL: TBatchMembershipDep,
  membershipRoleDAL: TMembershipRoleDep,
  projectId: string,
  actions: TPamActionFilter,
  actors: TPamActor[],
  tx?: Knex
) => {
  const byActor = new Map<string, { folderIds: Set<string>; accountIds: Set<string> }>(
    actors.map((actor) => [pamActorKey(actor), { folderIds: new Set<string>(), accountIds: new Set<string>() }])
  );
  if (byActor.size === 0) return byActor;

  const memberships = await membershipDAL.findResourceMembershipsForActors(
    {
      projectId,
      resourceTypes: [ResourceType.PamFolder, ResourceType.PamAccount],
      userIds: actors.filter((actor) => actor.type === ActorType.USER).map((actor) => actor.id),
      identityIds: actors.filter((actor) => actor.type === ActorType.IDENTITY).map((actor) => actor.id)
    },
    tx
  );

  const activeMemberships = memberships.filter((m) => m.isActive && m.scopeResourceId);
  if (activeMemberships.length === 0) return byActor;

  const roles = await membershipRoleDAL.find(
    { $in: { membershipId: [...new Set(activeMemberships.map((m) => m.id))] } },
    { tx }
  );
  const roleByMembershipId = activeRoleByMembershipId(roles);

  for (const membership of activeMemberships) {
    const role = roleByMembershipId.get(membership.id);
    const resources = byActor.get(pamActorKey({ type: membership.forActorType, id: membership.forActorId }));
    if (role && resources && roleMatchesActions(role, actions)) {
      if (membership.scopeResourceType === ResourceType.PamFolder) {
        resources.folderIds.add(membership.scopeResourceId!);
      } else {
        resources.accountIds.add(membership.scopeResourceId!);
      }
    }
  }

  return byActor;
};

// Resolves each account's effective (packed) resource permissions in a single membership fetch, so a
// list view can render per-account action states without one /permissions request per row. The merge
// mirrors getAccountPermissions (folder-level roles ∪ direct account-level roles).
export const getAccountPermissionRulesMap = async (
  membershipDAL: TMembershipDep,
  membershipRoleDAL: TMembershipRoleDep,
  projectId: string,
  accounts: { id: string; folderId?: string | null }[],
  ctx: TActorContext
) => {
  const permissionsByAccountId = new Map<string, PackRule<RawRuleOf<MongoAbility<PamResourcePermissionSet>>>[]>();
  if (accounts.length === 0) return permissionsByAccountId;

  const [folderMemberships, accountMemberships] = await Promise.all([
    membershipDAL.findResourceMembershipsForActor({
      projectId,
      resourceType: ResourceType.PamFolder,
      actorType: ctx.principal.type,
      actorId: ctx.principal.id
    }),
    membershipDAL.findResourceMembershipsForActor({
      projectId,
      resourceType: ResourceType.PamAccount,
      actorType: ctx.principal.type,
      actorId: ctx.principal.id
    })
  ]);

  const activeFolderMemberships = folderMemberships.filter((m) => m.isActive);
  const activeAccountMemberships = accountMemberships.filter((m) => m.isActive);
  const allMemberships = [...activeFolderMemberships, ...activeAccountMemberships];

  const roles =
    allMemberships.length > 0
      ? await membershipRoleDAL.find({ $in: { membershipId: allMemberships.map((m) => m.id) } })
      : [];

  const now = new Date();
  const rolesByMembershipId = new Map<string, string[]>();
  roles
    .filter((r) => !r.isTemporary || (r.temporaryAccessEndTime && now < new Date(r.temporaryAccessEndTime)))
    .forEach((r) => {
      rolesByMembershipId.set(r.membershipId, [...(rolesByMembershipId.get(r.membershipId) ?? []), r.role]);
    });

  const rolesByResourceId = (memberships: typeof allMemberships) => {
    const map = new Map<string, string[]>();
    memberships.forEach((m) => {
      const roleList = m.scopeResourceId ? rolesByMembershipId.get(m.id) : undefined;
      if (m.scopeResourceId && roleList?.length) {
        map.set(m.scopeResourceId, [...(map.get(m.scopeResourceId) ?? []), ...roleList]);
      }
    });
    return map;
  };

  const folderRolesByResourceId = rolesByResourceId(activeFolderMemberships);
  const accountRolesByResourceId = rolesByResourceId(activeAccountMemberships);

  const rulesForRole = (resourceType: ResourceType, role: string) => {
    try {
      return pamResourceRoles.resolveRole(role);
    } catch {
      return [];
    }
  };

  accounts.forEach((account) => {
    const rules: RawRuleOf<MongoAbility<PamResourcePermissionSet>>[] = [];
    if (account.folderId) {
      (folderRolesByResourceId.get(account.folderId) ?? []).forEach((role) => {
        rules.push(...rulesForRole(ResourceType.PamFolder, role));
      });
    }
    (accountRolesByResourceId.get(account.id) ?? []).forEach((role) => {
      rules.push(...rulesForRole(ResourceType.PamAccount, role));
    });
    const ability = createMongoAbility<PamResourcePermissionSet>(rules);
    permissionsByAccountId.set(account.id, packRules(ability.rules));
  });

  return permissionsByAccountId;
};
