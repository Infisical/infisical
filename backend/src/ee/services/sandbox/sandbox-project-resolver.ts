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
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { OrgServiceActor } from "@app/lib/types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

/**
 * Sandbox is a product without user-facing projects, the same shape as PAM: one hidden project per
 * org, created on first visit, existing only so the product has somewhere to hang membership and
 * permission context. Sandboxes themselves are keyed by org, not by this project.
 */

type TResolverDeps = {
  db: Knex;
  projectDAL: Pick<TProjectDALFactory, "find" | "findOne" | "create">;
  membershipDAL: Pick<TMembershipDALFactory, "create">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create">;
};

type TOrgAdminRow = {
  actorUserId: string | null;
  actorIdentityId: string | null;
  actorGroupId: string | null;
};

export type TSandboxProjectResolverFactory = ReturnType<typeof sandboxProjectResolverFactory>;

export const sandboxProjectResolverFactory = ({ db, projectDAL, membershipDAL, membershipRoleDAL }: TResolverDeps) => {
  const findDefaultProjectId = async (orgId: string, tx?: Knex): Promise<string | null> => {
    const projects = await projectDAL.find(
      { orgId, type: ProjectType.Sandbox },
      { sort: [["createdAt", "desc"]], limit: 1, tx }
    );
    return projects.length ? projects[0].id : null;
  };

  const ensureDefaultProject = async (orgId: string): Promise<string> =>
    db.transaction(async (tx) => {
      // Serialize concurrent bootstraps. A unique constraint can't do it: every sandbox project for
      // an org shares type=sandbox, including any left behind by a soft delete.
      await tx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`sandbox-bootstrap:${orgId}`]);

      const existingId = await findDefaultProjectId(orgId, tx);
      if (existingId) return existingId;

      const project = await projectDAL.create(
        {
          name: "Sandbox",
          slug: slugify(`sandbox-${alphaNumericNanoId(4)}`),
          type: ProjectType.Sandbox,
          orgId,
          version: ProjectVersion.V3,
          pitVersionLimit: 10
        },
        tx
      );

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

      const actors: Array<{ actorUserId: string } | { actorIdentityId: string } | { actorGroupId: string }> = [
        ...uniq(adminRows.map((r) => r.actorUserId)).map((actorUserId) => ({ actorUserId })),
        ...uniq(adminRows.map((r) => r.actorIdentityId)).map((actorIdentityId) => ({ actorIdentityId })),
        ...uniq(adminRows.map((r) => r.actorGroupId)).map((actorGroupId) => ({ actorGroupId }))
      ];

      for (const actor of actors) {
        // eslint-disable-next-line no-await-in-loop -- sequential inserts inside one transaction
        const membership = await membershipDAL.create(
          {
            scope: AccessScope.Project,
            scopeOrgId: orgId,
            scopeProjectId: project.id,
            ...actor,
            isActive: true
          },
          tx
        );

        // eslint-disable-next-line no-await-in-loop
        await membershipRoleDAL.create({ membershipId: membership.id, role: ProjectMembershipRole.Admin }, tx);
      }

      return project.id;
    });

  return {
    resolve: (actor: OrgServiceActor): Promise<string> => ensureDefaultProject(actor.orgId)
  };
};
