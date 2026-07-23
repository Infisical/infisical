import { createMongoAbility, ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, packRules } from "@casl/ability/extra";

import { ActionProjectType, ResourceType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ForbiddenRequestError } from "@app/lib/errors";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";

import { resolveResourceRoleRules } from "../permission/permission-service";
import {
  ResourcePermissionPamResourceActions,
  ResourcePermissionSet,
  ResourcePermissionSub
} from "../permission/resource-permission";

export type TActorContext = {
  actorId: string;
  actor: ActorType;
  actorOrgId: string;
  actorAuthMethod: ActorAuthMethod;
};

const pamRoleHasAction = (role: string, action: ResourcePermissionPamResourceActions): boolean => {
  try {
    const rules = resolveResourceRoleRules(ResourceType.PamFolder, role);
    const ability = createMongoAbility(rules);
    return ability.can(action, ResourcePermissionSub.PamResource);
  } catch {
    return false;
  }
};

type TPermissionDep = Pick<TPermissionServiceFactory, "getResourcePermission">;
type TProjectPermissionDep = Pick<TPermissionServiceFactory, "getProjectPermission">;
type TMembershipDep = Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
type TMembershipRoleDep = Pick<TMembershipRoleDALFactory, "find">;

export const verifyProductMembership = async (
  permissionService: TProjectPermissionDep,
  projectId: string,
  ctx: TActorContext
) => {
  const { hasRole } = await permissionService.getProjectPermission({
    actor: ctx.actor,
    actorId: ctx.actorId,
    projectId,
    actorAuthMethod: ctx.actorAuthMethod,
    actorOrgId: ctx.actorOrgId,
    actionProjectType: ActionProjectType.PAM
  });
  return { hasRole };
};

export const checkFolderPermission = async (
  permissionService: TPermissionDep,
  folderId: string,
  projectId: string,
  ctx: TActorContext
) => {
  return permissionService.getResourcePermission({
    actor: ctx.actor,
    actorId: ctx.actorId,
    projectId,
    resourceType: ResourceType.PamFolder,
    resourceId: folderId,
    actorAuthMethod: ctx.actorAuthMethod,
    actorOrgId: ctx.actorOrgId
  });
};

export const checkAccountAccess = async (
  permissionService: TPermissionDep,
  accountId: string,
  folderId: string | null | undefined,
  projectId: string,
  action: ResourcePermissionPamResourceActions,
  ctx: TActorContext
) => {
  if (folderId) {
    try {
      const { permission } = await checkFolderPermission(permissionService, folderId, projectId, ctx);
      ForbiddenError.from(permission).throwUnlessCan(action, ResourcePermissionSub.PamResource);
      return;
    } catch (err) {
      // No folder access: fall back to direct account access
      if (!(err instanceof ForbiddenError) && !(err instanceof ForbiddenRequestError)) throw err;
    }
  }

  const { permission } = await permissionService.getResourcePermission({
    actor: ctx.actor,
    actorId: ctx.actorId,
    projectId,
    resourceType: ResourceType.PamAccount,
    resourceId: accountId,
    actorAuthMethod: ctx.actorAuthMethod,
    actorOrgId: ctx.actorOrgId
  });
  ForbiddenError.from(permission).throwUnlessCan(action, ResourcePermissionSub.PamResource);
};

export const getResourceIdsWithActions = async (
  membershipDAL: TMembershipDep,
  membershipRoleDAL: TMembershipRoleDep,
  projectId: string,
  actions: {
    allOf?: ResourcePermissionPamResourceActions[];
    anyOf?: ResourcePermissionPamResourceActions[];
  },
  ctx: TActorContext
) => {
  const [folderMemberships, accountMemberships] = await Promise.all([
    membershipDAL.findResourceMembershipsForActor({
      projectId,
      resourceType: ResourceType.PamFolder,
      actorType: ctx.actor,
      actorId: ctx.actorId
    }),
    membershipDAL.findResourceMembershipsForActor({
      projectId,
      resourceType: ResourceType.PamAccount,
      actorType: ctx.actor,
      actorId: ctx.actorId
    })
  ]);

  const activeFolderMemberships = folderMemberships.filter((m) => m.isActive);
  const activeAccountMemberships = accountMemberships.filter((m) => m.isActive);

  const allMemberships = [...activeFolderMemberships, ...activeAccountMemberships];
  if (allMemberships.length === 0) {
    return { folderIds: [], accountIds: [] };
  }

  const roles = await membershipRoleDAL.find({
    $in: { membershipId: allMemberships.map((m) => m.id) }
  });
  const now = new Date();
  const activeRoles = roles.filter(
    (r) => !r.isTemporary || (r.temporaryAccessEndTime && now < new Date(r.temporaryAccessEndTime))
  );
  const roleByMembershipId = new Map(activeRoles.map((r) => [r.membershipId, r.role]));

  const roleMatchesActions = (role: string) => {
    if (actions.allOf && !actions.allOf.every((a) => pamRoleHasAction(role, a))) return false;
    if (actions.anyOf && !actions.anyOf.some((a) => pamRoleHasAction(role, a))) return false;
    return true;
  };

  const folderIds = activeFolderMemberships
    .filter((m) => {
      const role = roleByMembershipId.get(m.id);
      return m.scopeResourceId && role && roleMatchesActions(role);
    })
    .map((m) => m.scopeResourceId!);

  const accountIds = activeAccountMemberships
    .filter((m) => {
      const role = roleByMembershipId.get(m.id);
      return m.scopeResourceId && role && roleMatchesActions(role);
    })
    .map((m) => m.scopeResourceId!);

  return { folderIds, accountIds };
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
  const permissionsByAccountId = new Map<string, PackRule<RawRuleOf<MongoAbility<ResourcePermissionSet>>>[]>();
  if (accounts.length === 0) return permissionsByAccountId;

  const [folderMemberships, accountMemberships] = await Promise.all([
    membershipDAL.findResourceMembershipsForActor({
      projectId,
      resourceType: ResourceType.PamFolder,
      actorType: ctx.actor,
      actorId: ctx.actorId
    }),
    membershipDAL.findResourceMembershipsForActor({
      projectId,
      resourceType: ResourceType.PamAccount,
      actorType: ctx.actor,
      actorId: ctx.actorId
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
      return resolveResourceRoleRules(resourceType, role);
    } catch {
      return [];
    }
  };

  accounts.forEach((account) => {
    const rules: RawRuleOf<MongoAbility<ResourcePermissionSet>>[] = [];
    if (account.folderId) {
      (folderRolesByResourceId.get(account.folderId) ?? []).forEach((role) => {
        rules.push(...rulesForRole(ResourceType.PamFolder, role));
      });
    }
    (accountRolesByResourceId.get(account.id) ?? []).forEach((role) => {
      rules.push(...rulesForRole(ResourceType.PamAccount, role));
    });
    const ability = createMongoAbility<ResourcePermissionSet>(rules);
    permissionsByAccountId.set(account.id, packRules(ability.rules));
  });

  return permissionsByAccountId;
};
