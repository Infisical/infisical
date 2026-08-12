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
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

type TResolverDeps = {
  db: Knex;
  projectDAL: Pick<TProjectDALFactory, "find" | "create">;
  membershipDAL: Pick<TMembershipDALFactory, "create">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
};

type TOrgAdminRow = {
  actorUserId: string | null;
  actorIdentityId: string | null;
  actorGroupId: string | null;
};

export type TEndpointProjectResolverFactory = ReturnType<typeof endpointProjectResolverFactory>;

export const endpointProjectResolverFactory = ({
  db,
  projectDAL,
  membershipDAL,
  membershipRoleDAL,
  keyStore
}: TResolverDeps) => {
  // find() excludes soft-deleted projects; tx reads the primary for the in-lock re-check.
  const findDefaultProjectId = async (orgId: string, tx?: Knex): Promise<string | null> => {
    const projects = await projectDAL.find(
      { orgId, type: ProjectType.Endpoint },
      { sort: [["createdAt", "desc"]], limit: 1, tx }
    );
    return projects.length ? projects[0].id : null;
  };

  const ensureDefaultProject = async (orgId: string): Promise<string> =>
    db.transaction(async (tx) => {
      // Serialize concurrent bootstraps. A unique constraint cannot do this job because soft-deleted
      // projects keep type=endpoint.
      await tx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`endpoint-bootstrap:${orgId}`]);

      const existingId = await findDefaultProjectId(orgId, tx);
      if (existingId) return existingId;

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

      const project = await projectDAL.create(
        {
          name: "Endpoint",
          slug: slugify(`endpoint-${alphaNumericNanoId(4)}`),
          type: ProjectType.Endpoint,
          orgId,
          version: ProjectVersion.V3,
          pitVersionLimit: 10
        },
        tx
      );

      const uniq = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => Boolean(v)))];

      const adminActors: Array<{ actorUserId: string } | { actorIdentityId: string } | { actorGroupId: string }> = [
        ...uniq(adminRows.map((row) => row.actorUserId)).map((actorUserId) => ({ actorUserId })),
        ...uniq(adminRows.map((row) => row.actorIdentityId)).map((actorIdentityId) => ({ actorIdentityId })),
        ...uniq(adminRows.map((row) => row.actorGroupId)).map((actorGroupId) => ({ actorGroupId }))
      ];

      for (const actor of adminActors) {
        // eslint-disable-next-line no-await-in-loop
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
    resolve: (orgId: string): Promise<string> =>
      withCache({
        keyStore,
        key: KeyStorePrefixes.EndpointDefaultProject(orgId),
        ttlSeconds: KeyStoreTtls.EndpointDefaultProjectInSeconds,
        fetcher: async () => {
          const existingId = await findDefaultProjectId(orgId);
          if (existingId) return existingId;
          return ensureDefaultProject(orgId);
        }
      })
  };
};
