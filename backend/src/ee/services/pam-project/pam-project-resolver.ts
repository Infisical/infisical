import { Knex } from "knex";

import { AccessScope, OrgMembershipRole, ProjectType, TableName } from "@app/db/schemas";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";
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
  keyStore
}: TResolverDeps) => {
  const findDefaultProjectId = async (orgId: string): Promise<string | null> => {
    const projects = await projectDAL.find(
      { orgId, type: ProjectType.PAM },
      { sort: [["createdAt", "desc"]], limit: 1 }
    );
    return projects.length ? projects[0].id : null;
  };

  // Orgs with no PAM data get no consolidated project during the migration; the first PAM request
  // creates it here, seeded with the org's current admins so it is immediately usable (otherwise
  // no one could administer it, since the PAM permission model has no org-admin fallback).
  const ensureDefaultProject = (orgId: string): Promise<string> =>
    db.transaction(async (tx) => {
      // Serialize concurrent first-use bootstraps for the same org. There is no DB unique
      // constraint to rely on (old zombie PAM projects also have type=pam, so an org can legitimately
      // have several), and the advisory lock auto-releases when this transaction ends.
      await tx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`pam-bootstrap:${orgId}`]);

      // Re-check inside the lock on the primary, with the same semantics as findDefaultProjectId
      // (newest first, soft-deleted excluded). This resolves the race winner and, when several PAM
      // projects exist (consolidated + old zombies), returns the consolidated one rather than an
      // arbitrary row.
      const existing = await tx(TableName.Project)
        .where({ orgId, type: ProjectType.PAM })
        .whereNull("deleteAfter")
        .orderBy("createdAt", "desc")
        .first("id");
      if (existing) return existing.id;

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

      const { project } = await bootstrapPamProject(
        {
          orgId,
          adminUserIds: uniq(adminRows.map((r) => r.actorUserId)),
          adminIdentityIds: uniq(adminRows.map((r) => r.actorIdentityId)),
          adminGroupIds: uniq(adminRows.map((r) => r.actorGroupId))
        },
        { projectDAL, membershipDAL, membershipRoleDAL },
        tx
      );

      return project.id;
    });

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
