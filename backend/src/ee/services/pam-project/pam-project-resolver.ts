import { Knex } from "knex";

import { AccessScope, OrgMembershipRole, ProjectType, TableName } from "@app/db/schemas";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";
import { PamIdentities } from "@app/services/license-client";
import { TUsageMeteringServiceFactory } from "@app/services/license-client/usage";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { bootstrapPamProject } from "./pam-project-bootstrap";

type TResolverDeps = {
  db: Knex;
  projectDAL: Pick<TProjectDALFactory, "find" | "findOne" | "create">;
  membershipDAL: Pick<TMembershipDALFactory, "create">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
  usageMeteringService: Pick<TUsageMeteringServiceFactory, "emit">;
};

type TOrgAdminRow = {
  actorUserId: string | null;
  actorIdentityId: string | null;
  actorGroupId: string | null;
};

export type TPamProjectResolverFactory = ReturnType<typeof pamProjectResolverFactory>;

export const pamProjectResolverFactory = ({
  db,
  projectDAL,
  membershipDAL,
  membershipRoleDAL,
  keyStore,
  usageMeteringService
}: TResolverDeps) => {
  // Newest live PAM project (find() excludes soft-deleted); tx reads the primary for the in-lock re-check.
  const findDefaultProjectId = async (orgId: string, tx?: Knex): Promise<string | null> => {
    const projects = await projectDAL.find(
      { orgId, type: ProjectType.PAM },
      { sort: [["createdAt", "desc"]], limit: 1, tx }
    );
    return projects.length ? projects[0].id : null;
  };

  // Lazily create the project on first use, seeded with current org admins (PAM has no org-admin fallback).
  const ensureDefaultProject = async (orgId: string): Promise<string> => {
    const { projectId, created } = await db.transaction(async (tx) => {
      // Serialize concurrent bootstraps; a unique constraint won't work since zombie projects share type=pam.
      await tx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`pam-bootstrap:${orgId}`]);

      // Re-check inside the lock (race winner).
      const existingId = await findDefaultProjectId(orgId, tx);
      if (existingId) return { projectId: existingId, created: false };

      const adminRows = (await tx(TableName.Membership)
        .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .where(`${TableName.Membership}.isActive`, true)
        .where(`${TableName.MembershipRole}.role`, OrgMembershipRole.Admin)
        .where(`${TableName.MembershipRole}.isTemporary`, false)
        .select(
          `${TableName.Membership}.actorUserId`,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.Membership}.actorGroupId`
        )) as TOrgAdminRow[];

      const uniq = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => Boolean(v)))];

      const { project, created: bootstrapped } = await bootstrapPamProject(
        {
          orgId,
          adminUserIds: uniq(adminRows.map((r) => r.actorUserId)),
          adminIdentityIds: uniq(adminRows.map((r) => r.actorIdentityId)),
          adminGroupIds: uniq(adminRows.map((r) => r.actorGroupId))
        },
        { projectDAL, membershipDAL, membershipRoleDAL },
        tx
      );

      return { projectId: project.id, created: bootstrapped };
    });

    // Bootstrap seeds org admins as project members, which changes the pam_identities meter.
    if (created) {
      usageMeteringService.emit(orgId, PamIdentities.key);
    }
    return projectId;
  };

  return {
    resolve: (actorOrgId: string): Promise<string> =>
      withCache({
        keyStore,
        key: KeyStorePrefixes.PamDefaultProject(actorOrgId),
        ttlSeconds: KeyStoreTtls.PamDefaultProjectInSeconds,
        fetcher: async () => {
          const existingId = await findDefaultProjectId(actorOrgId);
          if (existingId) return existingId;
          return ensureDefaultProject(actorOrgId);
        }
      })
  };
};
