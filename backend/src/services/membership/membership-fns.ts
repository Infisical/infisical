import { AbilityTuple } from "@casl/ability";
import { Knex } from "knex";

import {
  AccessScope,
  getAdminMemberOnlyProductLabel,
  OrgMembershipRole,
  ProjectMembershipRole,
  ProjectType,
  TableName
} from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { Permission, TemporaryAccess } from "@app/domains/platform/access-control/ce/module";
import { PlanProduct, TLicenseService } from "@app/domains/platform/license/ce/module";
import type { TActorContextService } from "@app/domains/platform/organizations/ce/module";
import { PgSqlLock } from "@app/keystore/keystore";
import { ActorAuthMethod, ActorType } from "@app/lib/auth/actor-types";
import { delegatedOauthOf } from "@app/lib/auth/principal";
import { BadRequestError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

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

const isActiveRole = (role: TMembershipRole) => TemporaryAccess.restore(role).isActive();

export const resolveMembershipRoleSlugs = (roles: TMembershipRole[]) => [
  ...new Set(
    roles
      .filter(isActiveRole)
      .map((role) => role.customRoleSlug || role.role)
      .filter((slug) => slug !== OrgMembershipRole.NoAccess && slug !== ProjectMembershipRole.NoAccess)
  )
];

export const toBoundsTargets = (rolePermissions: { permission: Permission<AbilityTuple>; role?: { slug: string } }[]) =>
  rolePermissions.map(({ permission, role }) => ({ permission, roleSlug: role?.slug }));

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
  const productLabel = getAdminMemberOnlyProductLabel(project.type);
  if (!productLabel) return;
  // An org holds many Agent Vault projects, so the message names the project rather than the product.
  await assertWillRetainProjectAdmin({
    scopeProjectId: project.id,
    excludeMembershipIds,
    productLabel: project.type === ProjectType.AgentVault ? "This project" : productLabel,
    tx
  });
};

type TMemberActorContextDeps = {
  actorContextService: Pick<TActorContextService, "forPrincipal" | "forSession">;
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
};

// For building the member's own permission. The requester's delegated OAuth scopes carry over; for a user target
// so does its sign-in method (or the stored one, for queued work), which is checked against the org's sign-in policy.
export const buildMemberActorContext = async (
  { actorContextService, userDAL, identityDAL }: TMemberActorContextDeps,
  {
    target,
    orgId,
    requester,
    authMethod
  }: {
    target: { type: ActorType.USER | ActorType.IDENTITY; id: string };
    orgId: string;
    requester?: TActorContext;
    authMethod?: ActorAuthMethod;
  }
): Promise<TActorContext> => {
  if (requester && requester.principal.type === target.type && requester.principal.id === target.id) {
    return requester;
  }
  if (target.type === ActorType.USER) {
    const requestingUser = requester?.principal.type === ActorType.USER ? requester.principal : undefined;
    const oauth = delegatedOauthOf(requester?.principal);
    const user = await requestMemoize(requestMemoKeys.userFindById(target.id), () => userDAL.findById(target.id));
    const userAuthMethod = requestingUser?.authMethod ?? authMethod ?? null;
    const principal = {
      type: ActorType.USER as const,
      id: target.id,
      username: user?.username ?? "",
      email: user?.email ?? null,
      authMethod: userAuthMethod,
      isSuperAdmin: Boolean(user?.superAdmin),
      oauth
    };
    return userAuthMethod
      ? actorContextService.forSession({ principal, orgId })
      : actorContextService.forPrincipal({ principal, orgId });
  }
  const identity = await requestMemoize(requestMemoKeys.identityFindById(target.id), () =>
    identityDAL.findById(target.id)
  );
  return actorContextService.forPrincipal({
    principal: {
      type: ActorType.IDENTITY,
      id: target.id,
      name: identity?.name ?? "",
      isInstanceAdmin: false,
      oauth: delegatedOauthOf(requester?.principal)
    },
    orgId
  });
};
