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
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

type TResolverDeps = {
  db: Knex;
  projectDAL: Pick<TProjectDALFactory, "find" | "findById" | "create">;
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

  const listOrgAdminActors = async (orgId: string, tx: Knex): Promise<TAdminActor[]> => {
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

    const adminActors = new Map<string, TAdminActor>();
    for (const row of adminRows) {
      if (row.actorUserId) adminActors.set(`user:${row.actorUserId}`, { actorUserId: row.actorUserId });
      if (row.actorIdentityId)
        adminActors.set(`identity:${row.actorIdentityId}`, { actorIdentityId: row.actorIdentityId });
      if (row.actorGroupId) adminActors.set(`group:${row.actorGroupId}`, { actorGroupId: row.actorGroupId });
    }
    return [...adminActors.values()];
  };

  // Org admins become project admins in the same transaction, so access requests always have someone
  // to go to and nobody can join a half-set-up project. Two bulk inserts regardless of the admin count.
  const ensureDefaultProject = async (orgId: string): Promise<string> =>
    db.transaction(async (tx) => {
      // The lock createProject takes, so a lazy create and a manual one cannot both pass the one-per-org check.
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.CreateProject(orgId)]);

      const existingId = await findDefaultProjectId(orgId, tx);
      if (existingId) return existingId;

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

      const adminActors = await listOrgAdminActors(orgId, tx);
      const memberships = await membershipDAL.insertMany(
        adminActors.map((actor) => ({
          scope: AccessScope.Project,
          scopeOrgId: orgId,
          scopeProjectId: project.id,
          ...actor,
          isActive: true
        })),
        tx
      );
      await membershipRoleDAL.insertMany(
        memberships.map(({ id }) => ({ membershipId: id, role: ProjectMembershipRole.Admin })),
        tx
      );

      return project.id;
    });

  return {
    findActiveProjectId: (actorOrgId: string) => findDefaultProjectId(actorOrgId),
    isSecretScanningProject: async (projectId: string, expectedOrgId: string): Promise<boolean> => {
      const project = await projectDAL.findById(projectId);
      return Boolean(project && project.orgId === expectedOrgId && project.type === ProjectType.SecretScanning);
    },
    resolve: async (actorOrgId: string): Promise<string> => {
      const existingId = await findDefaultProjectId(actorOrgId);
      if (existingId) return existingId;
      return ensureDefaultProject(actorOrgId);
    }
  };
};
