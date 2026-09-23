import { Knex } from "knex";

import {
  AccessScope,
  getAdminMemberOnlyProductLabel,
  OrgMembershipRole,
  ProjectMembershipRole,
  ProjectType,
  TableName
} from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { isActiveRole } from "@app/ee/services/permission/permission-fns";
import { PgSqlLock } from "@app/keystore/keystore";
import { BadRequestError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { TProjectDALFactory } from "@app/services/project/project-dal";

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
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
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
  if (typeof plan.secretsTemporaryAccess === "boolean" && !plan.secretsTemporaryAccess) {
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
// can still administer the product, and a lapsed temporary role confers nothing so it is not counted.
export const assertWillRetainProjectAdmin = async ({
  scopeProjectId,
  excludeMembershipIds,
  productLabel,
  tx
}: TAssertWillRetainProjectAdminArg) => {
  await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.LastAdminGuard("project", scopeProjectId)]);

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
  if (excludeMembershipIds.length) {
    void query.whereNotIn(`${TableName.Membership}.id`, excludeMembershipIds);
  }

  const result = await query.countDistinct<{ count: string }[]>(`${TableName.Membership}.id as count`).first();
  if (Number(result?.count ?? 0) < 1) {
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
  if (project?.type !== ProjectType.AgentVault) return;
  const productLabel = getAdminMemberOnlyProductLabel(project.type);
  if (!productLabel) return;
  await assertWillRetainProjectAdmin({ scopeProjectId: project.id, excludeMembershipIds, productLabel, tx });
};
