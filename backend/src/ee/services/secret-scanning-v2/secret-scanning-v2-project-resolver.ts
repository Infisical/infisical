import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import {
  AccessScope,
  OrgMembershipRole,
  ProjectMembershipRole,
  ProjectType,
  ProjectVersion,
  TableName
} from "@app/db/schemas";
import { PgSqlLock } from "@app/keystore/keystore";
import { chunkArray } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

const ADMIN_MEMBERSHIP_BATCH_SIZE = 500;

type TResolverDeps = {
  db: Knex;
  projectDAL: Pick<TProjectDALFactory, "find" | "create">;
  membershipDAL: Pick<TMembershipDALFactory, "insertMany">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "insertMany">;
};

type TAdminActor = { actorUserId: string } | { actorIdentityId: string } | { actorGroupId: string };

type TOrgAdminRow = {
  actorUserId: string | null;
  actorIdentityId: string | null;
  actorGroupId: string | null;
};

export type TSecretScanningV2ProjectResolverFactory = ReturnType<typeof secretScanningV2ProjectResolverFactory>;

export const secretScanningV2ProjectResolverFactory = ({
  db,
  projectDAL,
  membershipDAL,
  membershipRoleDAL
}: TResolverDeps) => {
  // Orgs from before the one-project limit can have several; the newest one is the active project.
  const findDefaultProjectId = async (orgId: string, tx?: Knex): Promise<string | null> => {
    const projects = await projectDAL.find(
      { orgId, type: ProjectType.SecretScanning },
      { sort: [["createdAt", "desc"]], limit: 1, tx }
    );
    return projects.length ? projects[0].id : null;
  };

  const listOrgAdminActors = async (orgId: string): Promise<TAdminActor[]> => {
    const adminRows = (await db(TableName.Membership)
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

    const adminActors = new Map<string, TAdminActor>();
    for (const row of adminRows) {
      if (row.actorUserId) adminActors.set(`user:${row.actorUserId}`, { actorUserId: row.actorUserId });
      if (row.actorIdentityId)
        adminActors.set(`identity:${row.actorIdentityId}`, { actorIdentityId: row.actorIdentityId });
      if (row.actorGroupId) adminActors.set(`group:${row.actorGroupId}`, { actorGroupId: row.actorGroupId });
    }
    return [...adminActors.values()];
  };

  // Org admins become project admins so access requests have someone to go to. The admin count is
  // tenant-sized, so they are added in bounded batches after the project commits rather than inside the
  // locked creation transaction. A failed batch leaves those admins out; they can still join through
  // grant-admin-access, which is idempotent.
  const addOrgAdminsAsProjectAdmins = async (orgId: string, projectId: string) => {
    const adminActors = await listOrgAdminActors(orgId);

    for (const batch of chunkArray(adminActors, ADMIN_MEMBERSHIP_BATCH_SIZE)) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await db.transaction(async (tx) => {
          const memberships = await membershipDAL.insertMany(
            batch.map((actor) => ({
              scope: AccessScope.Project,
              scopeOrgId: orgId,
              scopeProjectId: projectId,
              ...actor,
              isActive: true
            })),
            tx
          );

          await membershipRoleDAL.insertMany(
            memberships.map((membership) => ({ membershipId: membership.id, role: ProjectMembershipRole.Admin })),
            tx
          );
        });
      } catch (error) {
        logger.error(
          { error },
          `Failed to add org admins to the Secret Scanning project [orgId=${orgId}] [projectId=${projectId}] [batchSize=${batch.length}]`
        );
      }
    }
  };

  const ensureDefaultProject = async (orgId: string): Promise<string> => {
    const { projectId, created } = await db.transaction(async (tx) => {
      // The lock createProject takes, so a lazy create and a manual one cannot both pass the one-per-org check.
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.CreateProject(orgId)]);

      const existingId = await findDefaultProjectId(orgId, tx);
      if (existingId) return { projectId: existingId, created: false };

      const project = await projectDAL.create(
        {
          name: "Secret Scanning",
          slug: slugify(`secret-scanning-${alphaNumericNanoId(4)}`),
          type: ProjectType.SecretScanning,
          orgId,
          version: ProjectVersion.V3,
          pitVersionLimit: 10
        },
        tx
      );

      return { projectId: project.id, created: true };
    });

    if (created) await addOrgAdminsAsProjectAdmins(orgId, projectId);

    return projectId;
  };

  return {
    resolve: async (actorOrgId: string): Promise<string> => {
      const existingId = await findDefaultProjectId(actorOrgId);
      if (existingId) return existingId;
      return ensureDefaultProject(actorOrgId);
    }
  };
};
