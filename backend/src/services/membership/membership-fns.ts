import { Knex } from "knex";

import {
  AccessScope,
  ActionProjectType,
  getAdminRequiredProductLabel,
  OrgMembershipRole,
  ProjectMembershipRole,
  ProjectType,
  TableName,
  TMembershipRolesInsert
} from "@app/db/schemas";
import { PlanProduct, TLicenseService } from "@app/domains/platform/license/ce/module";
import {
  AGENT_VAULT_BUILT_IN_ROLES,
  agentVaultNoSuchRoleMessage,
  assertAgentVaultKeptRolesWithinLimit,
  assertAgentVaultRoleSetLimits,
  findAgentVaultMemberRole
} from "@app/ee/services/agent-vault-member/agent-vault-member-role-fns";
import { isActiveRole } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { isCustomProjectRole } from "@app/ee/services/permission/project-permission";
import { PgSqlLock } from "@app/keystore/keystore";
import { BadRequestError, ConflictError, ForbiddenRequestError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { OrgServiceActor } from "@app/lib/types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TRoleDALFactory } from "@app/services/role/role-dal";

import { TMembershipRoleDALFactory } from "./membership-role-dal";

// secretsTemporaryAccess gates temporary (time-bound) role assignment in Secret Management projects.
// It is ignored when null (no restriction); an explicit boolean enforces it, blocking temporary role
// assignment when false. No-op for org scope, non-Secret-Management projects, or permanent-only roles.
export const assertSecretsTemporaryAccessAllowed = async ({
  licenseService,
  projectDAL,
  scope,
  projectId,
  orgId,
  roles
}: {
  licenseService: TLicenseService;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  scope: AccessScope;
  projectId?: string;
  orgId: string;
  roles: { isTemporary?: boolean }[];
}) => {
  if (scope !== AccessScope.Project || !projectId) {
    return;
  }
  if (!roles.some((role) => role.isTemporary)) {
    return;
  }

  const project = await requestMemoize(requestMemoKeys.projectFindById(projectId), () =>
    projectDAL.findById(projectId)
  );
  if (project?.type !== ProjectType.SecretManager) {
    return;
  }

  const plan = await licenseService.getPlan(orgId);
  if (!plan.allows(PlanProduct.SecretsTemporaryAccess)) {
    throw new BadRequestError({
      message: "Temporary access is not available on your current plan. Please upgrade to continue."
    });
  }
};

type TMembershipRole = {
  role: string;
  customRoleSlug?: string | null;
  isTemporary?: boolean;
  temporaryAccessEndTime?: Date | null;
};

export const roleNeedsPrivilegeBoundary = (role: string) =>
  role !== OrgMembershipRole.NoAccess && role !== ProjectMembershipRole.NoAccess;

export const filterRolesNeedingPrivilegeBoundary = <T extends { role: string }>(roles: T[]) =>
  roles.filter((el) => roleNeedsPrivilegeBoundary(el.role));

export const resolveMembershipRoleSlugs = (roles: TMembershipRole[]) => [
  ...new Set(
    roles
      .filter(isActiveRole)
      .map((role) => role.customRoleSlug || role.role)
      .filter((slug) => slug !== OrgMembershipRole.NoAccess && slug !== ProjectMembershipRole.NoAccess)
  )
];

type TAssertWillRetainProjectAdminArg = {
  scopeProjectId: string;
  excludeMembershipIds: string[];
  productLabel: string;
  tx: Knex;
};

// Must run inside the same transaction as the membership mutation, like assertWillRetainOrgAdmin: the
// advisory lock serializes admin mutations per project so two concurrent demotions cannot both pass the
// count and leave none. Every actor kind counts, since a group or machine identity holding the admin role
// can still administer the product, and a lapsed temporary role confers nothing so it is not counted. A
// change that touches no live admin cannot lower the count, so it passes even in an already adminless project.
export const assertWillRetainProjectAdmin = async ({
  scopeProjectId,
  excludeMembershipIds,
  productLabel,
  tx
}: TAssertWillRetainProjectAdminArg) => {
  await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.LastAdminGuard("project", scopeProjectId)]);

  const countLiveAdmins = async (filter: (qb: Knex.QueryBuilder) => void) => {
    const query = tx(TableName.Membership)
      .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
      .where(`${TableName.Membership}.scope`, AccessScope.Project)
      .where(`${TableName.Membership}.scopeProjectId`, scopeProjectId)
      .where(`${TableName.Membership}.isActive`, true)
      .where(`${TableName.MembershipRole}.role`, ProjectMembershipRole.Admin)
      .where((qb) => {
        void qb
          .where(`${TableName.MembershipRole}.isTemporary`, false)
          .orWhere(`${TableName.MembershipRole}.temporaryAccessEndTime`, ">", new Date());
      });
    filter(query);
    const result = await query.countDistinct<{ count: string }[]>(`${TableName.Membership}.id as count`).first();
    return Number(result?.count ?? 0);
  };

  const remaining = await countLiveAdmins((qb) => {
    if (excludeMembershipIds.length) void qb.whereNotIn(`${TableName.Membership}.id`, excludeMembershipIds);
  });
  if (remaining > 0) return;

  const removing = await countLiveAdmins((qb) => {
    void qb.whereIn(`${TableName.Membership}.id`, excludeMembershipIds);
  });
  if (removing > 0) {
    throw new BadRequestError({ message: `${productLabel} must keep at least one admin` });
  }
};

// The org-scoped products refuse to lose their last admin on their own routes; the generic project
// membership routes reach the same rows, so they run the same check when the project is one of those.
export const assertProductWillRetainAdmin = async ({
  project,
  excludeMembershipIds,
  tx
}: {
  project: { id: string; type?: string | null } | undefined | null;
  excludeMembershipIds: string[];
  tx: Knex;
}) => {
  if (!project) return;
  const productLabel = getAdminRequiredProductLabel(project.type);
  if (!productLabel) return;
  // An org holds many Agent Vault projects, so the message names the project rather than the product.
  await assertWillRetainProjectAdmin({
    scopeProjectId: project.id,
    excludeMembershipIds,
    productLabel: project.type === ProjectType.AgentVault ? "This project" : productLabel,
    tx
  });
};

const isAgentVaultLegacyRole = (role: string) =>
  role === ProjectMembershipRole.Member || role === ProjectMembershipRole.Viewer;

// In an Agent Vault project `member` names the Member role the role migration made in a project that had Member rows, as
// on Agent Vault's own members routes, so a client that still sends it keeps working there. `viewer` names it too, since
// a client that sends it expects the same access. A project without that role refuses both like any role it doesn't
// have. Drop the alias after 2027-01-04, but keep dropping repeated roles.
export const withAgentVaultMemberAlias = async <T extends { role: string }>(
  {
    projectDAL,
    roleDAL
  }: {
    projectDAL: Pick<TProjectDALFactory, "findById">;
    roleDAL: Pick<TRoleDALFactory, "findById">;
  },
  scopeData: { scope: AccessScope; orgId?: string; projectId?: string },
  roles: T[]
): Promise<T[]> => {
  if (scopeData.scope !== AccessScope.Project || !scopeData.projectId) return roles;
  const { projectId } = scopeData;
  const project = await requestMemoize(requestMemoKeys.projectFindById(projectId), () =>
    projectDAL.findById(projectId)
  );
  if (project?.type !== ProjectType.AgentVault) return roles;
  // A project in another org is left to the guards, so the request learns nothing about it before they run.
  if (scopeData.orgId && project.orgId !== scopeData.orgId) return roles;
  let aliased = roles;
  if (roles.some((el) => isAgentVaultLegacyRole(el.role))) {
    const memberRole = await findAgentVaultMemberRole(roleDAL, project.id);
    if (!memberRole) {
      const legacy = roles.find((el) => isAgentVaultLegacyRole(el.role))!.role;
      throw new BadRequestError({ message: agentVaultNoSuchRoleMessage(legacy) });
    }
    aliased = roles.map((el) => (isAgentVaultLegacyRole(el.role) ? { ...el, role: memberRole.slug } : el));
  }
  // Each role is written as its own row, so one sent twice would be held twice; the members API drops repeats too.
  const seen = new Set<string>();
  return aliased.filter((el) => {
    if (seen.has(el.role)) return false;
    seen.add(el.role);
    return true;
  });
};

/**
 * The Agent Vault project whose access bundle roles this role change keeps, if any. A client that still sends `member`
 * or `viewer` to an Agent Vault project predates its custom roles and knows nothing of access bundle roles, which carry
 * the access bundle grants it manages apart from a member's role, so its change keeps the ones the member holds
 * (replaceMembershipRoles), as the deprecated `role` on Agent Vault's own members routes does. Ask before
 * withAgentVaultMemberAlias rewrites the aliases. Drop with the alias after 2027-01-04.
 */
export const findProjectKeepingBundleRoles = async (
  projectDAL: Pick<TProjectDALFactory, "findById">,
  scopeData: { scope: AccessScope; projectId?: string },
  roles: { role: string }[]
): Promise<string | undefined> => {
  if (scopeData.scope !== AccessScope.Project || !scopeData.projectId) return undefined;
  if (!roles.some((el) => isAgentVaultLegacyRole(el.role))) return undefined;
  const { projectId } = scopeData;
  const project = await requestMemoize(requestMemoKeys.projectFindById(projectId), () =>
    projectDAL.findById(projectId)
  );
  return project?.type === ProjectType.AgentVault ? projectId : undefined;
};

// The lock every Agent Vault role change takes before it reads roles. Take it before locking the membership row: a
// change holding it can wait on that row, so the other order deadlocks.
export const lockProjectRoleChanges = async (projectId: string, tx: Knex) => {
  await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.LastAdminGuard("project", projectId)]);
};

/**
 * Replaces a membership's roles with these. With keepBundleRolesInProjectId (see findProjectKeepingBundleRoles), the
 * access bundle roles the membership holds stay as they are and are never given twice, and they count toward the most
 * roles a member can hold. The caller holds lockProjectRoleChanges for that project.
 */
export const replaceMembershipRoles = async (
  { membershipRoleDAL }: { membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find" | "delete" | "insertMany"> },
  {
    membershipId,
    roleDocs,
    keepBundleRolesInProjectId
  }: { membershipId: string; roleDocs: TMembershipRolesInsert[]; keepBundleRolesInProjectId?: string },
  tx: Knex
) => {
  if (!keepBundleRolesInProjectId) {
    await membershipRoleDAL.delete({ membershipId }, tx);
    return membershipRoleDAL.insertMany(roleDocs, tx);
  }

  const current = await membershipRoleDAL.find({ membershipId }, { tx });
  const bundleRoleIds = new Set(
    (
      (await tx(TableName.AgentVaultAccessBundle)
        .where({ projectId: keepBundleRolesInProjectId })
        .whereNotNull("grantRoleId")
        .select("grantRoleId")) as { grantRoleId: string }[]
    ).map((row) => row.grantRoleId)
  );
  // A role whose time limit has ended grants nothing, so it is replaced like the rest.
  const kept = current.filter((row) => row.customRoleId && bundleRoleIds.has(row.customRoleId) && isActiveRole(row));
  const added = roleDocs.filter(
    (doc) => !kept.some((row) => Boolean(doc.customRoleId) && row.customRoleId === doc.customRoleId)
  );
  assertAgentVaultKeptRolesWithinLimit(kept.length + added.length);
  const replaced = current.filter((row) => !kept.includes(row));
  if (replaced.length) await membershipRoleDAL.delete({ $in: { id: replaced.map((row) => row.id) } }, tx);
  return [...kept, ...(added.length ? await membershipRoleDAL.insertMany(added, tx) : [])];
};

// Admin reaches everything in an Agent Vault project, so only an admin of the project can give it, or change or remove a
// member who holds it, here as on Agent Vault's own members routes. A role that can manage members and assign roles
// still can't make or unmake an admin.
export const assertAgentVaultAdminOnlyChange = ({
  project,
  hasRole,
  givesAdmin,
  touchesAdmin
}: {
  project: { type?: string | null } | undefined | null;
  hasRole: (role: string) => boolean;
  givesAdmin: boolean;
  touchesAdmin: boolean;
}) => {
  if (project?.type !== ProjectType.AgentVault || (!givesAdmin && !touchesAdmin)) return;
  if (hasRole(ProjectMembershipRole.Admin)) return;
  throw new ForbiddenRequestError({
    message: givesAdmin
      ? "Only an Agent Vault admin can give the admin role."
      : "Only an Agent Vault admin can change or remove another admin."
  });
};

// The members API's limits on one member's roles (assertAgentVaultRoleSetLimits), so a generic route can't save a set the
// members API and the dashboard would refuse. That includes a time limit, which the members API never takes and nothing
// in Agent Vault shows, and the built-in roles of other products, which Agent Vault resolves to nothing (`custom`, with
// no role behind it, would break every permission check for the member). Call it after withAgentVaultMemberAlias has
// turned `member` and `viewer` into the project's Member role.
export const assertAgentVaultRoleLimits = ({
  project,
  roles
}: {
  project: { type?: string | null } | undefined | null;
  roles: { role: string; isTemporary?: boolean }[];
}) => {
  if (project?.type !== ProjectType.AgentVault) return;
  if (roles.some((el) => el.isTemporary)) {
    throw new BadRequestError({
      message: "Agent Vault doesn't support temporary roles yet. Give the role without a time limit."
    });
  }
  const otherBuiltIn = roles.find(
    (el) => !isCustomProjectRole(el.role) && !AGENT_VAULT_BUILT_IN_ROLES.includes(el.role)
  );
  if (otherBuiltIn) {
    throw new BadRequestError({ message: agentVaultNoSuchRoleMessage(otherBuiltIn.role) });
  }
  assertAgentVaultRoleSetLimits(roles.map((el) => el.role));
};

type TAgentVaultRoleChangeDeps = {
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

type TAgentVaultRoleChangeArg = {
  scopeData: { scope: AccessScope; projectId?: string };
  actor: Pick<OrgServiceActor, "type" | "id" | "authMethod" | "orgId">;
};

export type TAgentVaultRoleChange = { projectId: string; actorIsAdmin: boolean } | null;

/**
 * A role change through a generic route in an Agent Vault project runs under the project's role-change lock and, for a
 * non-admin, checks its target again there (lockAgentVaultRoleChange). Call this before the write's transaction. Null
 * for any other project.
 */
export const findAgentVaultRoleChange = async (
  { projectDAL, permissionService }: TAgentVaultRoleChangeDeps,
  { scopeData, actor }: TAgentVaultRoleChangeArg
): Promise<TAgentVaultRoleChange> => {
  if (scopeData.scope !== AccessScope.Project || !scopeData.projectId) return null;
  const { projectId } = scopeData;
  const project = await requestMemoize(requestMemoKeys.projectFindById(projectId), () =>
    projectDAL.findById(projectId)
  );
  if (project?.type !== ProjectType.AgentVault) return null;
  const { hasRole } = await permissionService.getProjectPermission({
    actor: actor.type,
    actorId: actor.id,
    projectId,
    actorAuthMethod: actor.authMethod,
    actorOrgId: actor.orgId,
    actionProjectType: ActionProjectType.Any
  });
  return { projectId, actorIsAdmin: hasRole(ProjectMembershipRole.Admin) };
};

// Takes the project's role-change lock, then refuses if any of these memberships holds Admin now. An expired temporary
// Admin confers nothing, so it doesn't count, as in the guard and the last-admin check. Call it before the write locks a
// membership row (see lockProjectRoleChanges), for a non-admin's write only: an admin passes the rule whatever the
// target holds.
export const assertAgentVaultAdminTargetUnchanged = async (
  { projectId, membershipIds }: { projectId: string | null; membershipIds: string[] },
  tx: Knex
) => {
  if (!projectId || !membershipIds.length) return;
  await lockProjectRoleChanges(projectId, tx);
  const adminRow = (await tx(TableName.MembershipRole)
    .whereIn("membershipId", membershipIds)
    .where("role", ProjectMembershipRole.Admin)
    .where((live) => {
      void live.where("isTemporary", false).orWhere("temporaryAccessEndTime", ">", new Date());
    })
    .first("id")) as { id: string } | undefined;
  assertAgentVaultAdminOnlyChange({
    project: { type: ProjectType.AgentVault },
    hasRole: () => false,
    givesAdmin: false,
    touchesAdmin: Boolean(adminRow)
  });
};

// The role slugs a guard checks its target against, read the way lockAgentVaultRoleChange reads them again under the
// lock: every live row (an ended time limit confers nothing), custom roles by slug.
export const checkedRoleSlugsOf = (roles: TMembershipRole[]) =>
  [...new Set(roles.filter(isActiveRole).map((role) => role.customRoleSlug || role.role))].sort();

// The roles a guard in an Agent Vault project checked its target against, for lockAgentVaultRoleChange.
export type TAgentVaultCheckedTarget = { checkedRoleSlugs?: string[] };

// A guard in an Agent Vault project reads its target's roles on the primary: lockAgentVaultRoleChange compares them with
// the rows under the write's lock, and a replica behind a change made a moment ago would make the two disagree.
export const readTargetForAgentVaultRecheck = <T>(
  dal: { transaction: <R>(cb: (tx: Knex) => Promise<R>) => Promise<R> },
  isAgentVault: boolean,
  read: (tx?: Knex) => Promise<T>
): Promise<T> => (isAgentVault ? dal.transaction((tx) => read(tx)) : read());

/**
 * First thing in the transaction of a role change through a generic route (findAgentVaultRoleChange). Takes the project's
 * role-change lock, so no grant or other change lands between this write's reads and its writes. A non-admin's guard
 * checked the target's roles as read before the lock, so this refuses if the target holds Admin now, and starts over if
 * its roles changed at all: the boundary check covered only the roles it read. An admin passes both checks whatever the
 * target holds.
 */
export const lockAgentVaultRoleChange = async (
  change: TAgentVaultRoleChange,
  { membershipId, checked }: { membershipId?: string; checked?: TAgentVaultCheckedTarget | void },
  tx: Knex
) => {
  if (!change) return;
  await lockProjectRoleChanges(change.projectId, tx);
  if (change.actorIsAdmin || !membershipId) return;
  await assertAgentVaultAdminTargetUnchanged({ projectId: change.projectId, membershipIds: [membershipId] }, tx);

  const checkedRoleSlugs = checked ? checked.checkedRoleSlugs : undefined;
  if (!checkedRoleSlugs) return;
  const rows = (await tx(TableName.MembershipRole)
    .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
    .where(`${TableName.MembershipRole}.membershipId`, membershipId)
    .select(
      `${TableName.MembershipRole}.role`,
      `${TableName.MembershipRole}.isTemporary`,
      `${TableName.MembershipRole}.temporaryAccessEndTime`,
      `${TableName.Role}.slug as customRoleSlug`
    )) as TMembershipRole[];
  if (checkedRoleSlugsOf(rows).join(",") !== checkedRoleSlugs.join(",")) {
    throw new ConflictError({ message: "A member's roles changed while this request was running. Try again." });
  }
};

export const rolesGiveAdmin = (roles: { role: string }[]) =>
  roles.some((el) => el.role === ProjectMembershipRole.Admin);

// Access in an Agent Vault project comes from custom roles (its only built-in roles are Admin and No Access), so giving
// one there works on every plan. Everywhere else custom roles need the RBAC plan.
export const customRolesNeedRbacPlan = async (
  projectDAL: Pick<TProjectDALFactory, "findById">,
  scopeData: { scope: AccessScope; projectId?: string }
) => {
  if (scopeData.scope !== AccessScope.Project || !scopeData.projectId) return true;
  const { projectId } = scopeData;
  const project = await requestMemoize(requestMemoKeys.projectFindById(projectId), () =>
    projectDAL.findById(projectId)
  );
  return project?.type !== ProjectType.AgentVault;
};
