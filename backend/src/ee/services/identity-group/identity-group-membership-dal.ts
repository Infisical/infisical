import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TIdentityGroupMembershipDALFactory = ReturnType<typeof identityGroupMembershipDALFactory>;

export const identityGroupMembershipDALFactory = (db: TDbClient) => {
  const identityGroupMembershipOrm = ormify(db, TableName.IdentityGroupMembership);

  /**
   * Returns a sub-set of projectIds fed into this function corresponding to projects where either:
   * - The identity is a direct member of the project.
   * - The identity is a member of a group that is a member of the project, excluding projects that they are part of
   * through the group with id [groupId].
   */
  const filterProjectsByIdentityMembership = async (
    identityId: string,
    groupId: string,
    projectIds: string[],
    tx?: Knex
  ) => {
    try {
      const identityProjectMemberships: string[] = await (tx || db.replicaNode())(TableName.IdentityProjectMembership)
        .where(`${TableName.IdentityProjectMembership}.identityId`, identityId)
        .whereIn(`${TableName.IdentityProjectMembership}.projectId`, projectIds)
        .pluck(`${TableName.IdentityProjectMembership}.projectId`);

      const identityGroupMemberships: string[] = await (tx || db.replicaNode())(TableName.IdentityGroupMembership)
        .where(`${TableName.IdentityGroupMembership}.identityId`, identityId)
        .whereNot(`${TableName.IdentityGroupMembership}.groupId`, groupId)
        .join(
          TableName.IdentityGroupProjectMembership,
          `${TableName.IdentityGroupMembership}.groupId`,
          `${TableName.IdentityGroupProjectMembership}.groupId`
        )
        .whereIn(`${TableName.IdentityGroupProjectMembership}.projectId`, projectIds)
        .pluck(`${TableName.IdentityGroupProjectMembership}.projectId`);

      return new Set(identityProjectMemberships.concat(identityGroupMemberships));
    } catch (error) {
      throw new DatabaseError({ error, name: "Filter projects by identity membership" });
    }
  };

  // special query
  const findIdentityGroupMembershipsInProject = async (identityNames: string[], projectId: string, tx?: Knex) => {
    try {
      const identityDocs: string[] = await (tx || db.replicaNode())(TableName.IdentityGroupMembership)
        .join(
          TableName.IdentityGroupProjectMembership,
          `${TableName.IdentityGroupMembership}.groupId`,
          `${TableName.IdentityGroupProjectMembership}.groupId`
        )
        .join(TableName.Identity, `${TableName.IdentityGroupMembership}.identityId`, `${TableName.Identity}.id`)
        .where(`${TableName.IdentityGroupProjectMembership}.projectId`, projectId)
        .whereIn(`${TableName.Identity}.name`, identityNames)
        .pluck(`${TableName.Identity}.id`);

      return identityDocs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find identity group members in project" });
    }
  };

  /**
   * Return list of identities that are part of the group with id [groupId]
   * that have not yet been added individually to project with id [projectId].
   *
   * Note: Filters out identities that are part of other groups in the project.
   * @param groupId
   * @param projectId
   * @returns
   */
  const findIdentityGroupMembersNotInProject = async (groupId: string, projectId: string, tx?: Knex) => {
    try {
      // get list of groups in the project with id [projectId]
      // that are not the group with id [groupId]
      const groups: string[] = await (tx || db.replicaNode())(TableName.IdentityGroupProjectMembership)
        .where(`${TableName.IdentityGroupProjectMembership}.projectId`, projectId)
        .whereNot(`${TableName.IdentityGroupProjectMembership}.groupId`, groupId)
        .pluck(`${TableName.IdentityGroupProjectMembership}.groupId`);

      // main query
      const members = await (tx || db.replicaNode())(TableName.IdentityGroupMembership)
        .where(`${TableName.IdentityGroupMembership}.groupId`, groupId)
        .join(TableName.Identity, `${TableName.IdentityGroupMembership}.identityId`, `${TableName.Identity}.id`)
        .leftJoin(TableName.IdentityProjectMembership, (bd) => {
          bd.on(`${TableName.Identity}.id`, "=", `${TableName.IdentityProjectMembership}.identityId`).andOn(
            `${TableName.IdentityProjectMembership}.projectId`,
            "=",
            db.raw("?", [projectId])
          );
        })
        .whereNull(`${TableName.IdentityProjectMembership}.identityId`)
        .select(
          db.ref("id").withSchema(TableName.IdentityGroupMembership),
          db.ref("groupId").withSchema(TableName.IdentityGroupMembership),
          db.ref("name").withSchema(TableName.Identity),
          db.ref("authMethod").withSchema(TableName.Identity),
          db.ref("id").withSchema(TableName.Identity).as("identityId")
        )
        .whereNotIn(`${TableName.IdentityGroupMembership}.identityId`, (bd) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          bd.select(`${TableName.IdentityGroupMembership}.identityId`)
            .from(TableName.IdentityGroupMembership)
            .whereIn(`${TableName.IdentityGroupMembership}.groupId`, groups);
        });

      return members.map(({ name, authMethod, identityId, ...data }) => ({
        ...data,
        identity: { name, authMethod, id: identityId }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find identity group members not in project" });
    }
  };

  const findIdentityGroupMembershipsByIdentityIdInOrg = async (identityId: string, orgId: string) => {
    try {
      const docs = await db
        .replicaNode()(TableName.IdentityGroupMembership)
        .join(
          TableName.IdentityGroups,
          `${TableName.IdentityGroupMembership}.groupId`,
          `${TableName.IdentityGroups}.id`
        )
        .join(
          TableName.IdentityOrgMembership,
          `${TableName.IdentityGroupMembership}.identityId`,
          `${TableName.IdentityOrgMembership}.identityId`
        )
        .join(TableName.Identity, `${TableName.IdentityGroupMembership}.identityId`, `${TableName.Identity}.id`)
        .where(`${TableName.IdentityGroupMembership}.identityId`, identityId)
        .where(`${TableName.IdentityGroups}.orgId`, orgId)
        .select(
          db.ref("id").withSchema(TableName.IdentityGroupMembership),
          db.ref("groupId").withSchema(TableName.IdentityGroupMembership),
          db.ref("name").withSchema(TableName.IdentityGroups).as("groupName"),
          db.ref("id").withSchema(TableName.IdentityOrgMembership).as("identityOrgMembershipId"),
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("slug").withSchema(TableName.IdentityGroups).as("groupSlug")
        );

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find identity group memberships by identity id in org" });
    }
  };

  const findIdentityGroupMembershipsByGroupIdInOrg = async (groupId: string, orgId: string) => {
    try {
      const docs = await db
        .replicaNode()(TableName.IdentityGroupMembership)
        .join(
          TableName.IdentityGroups,
          `${TableName.IdentityGroupMembership}.groupId`,
          `${TableName.IdentityGroups}.id`
        )
        .join(
          TableName.IdentityOrgMembership,
          `${TableName.IdentityGroupMembership}.identityId`,
          `${TableName.IdentityOrgMembership}.identityId`
        )
        .join(TableName.Identity, `${TableName.IdentityGroupMembership}.identityId`, `${TableName.Identity}.id`)
        .where(`${TableName.IdentityGroups}.id`, groupId)
        .where(`${TableName.IdentityGroups}.orgId`, orgId)
        .select(
          db.ref("id").withSchema(TableName.IdentityGroupMembership),
          db.ref("groupId").withSchema(TableName.IdentityGroupMembership),
          db.ref("name").withSchema(TableName.IdentityGroups).as("groupName"),
          db.ref("id").withSchema(TableName.IdentityOrgMembership).as("identityOrgMembershipId"),
          db.ref("name").withSchema(TableName.Identity).as("identityName")
        );
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find identity group memberships by group id in org" });
    }
  };

  return {
    ...identityGroupMembershipOrm,
    filterProjectsByIdentityMembership,
    findIdentityGroupMembershipsInProject,
    findIdentityGroupMembersNotInProject,
    findIdentityGroupMembershipsByIdentityIdInOrg,
    findIdentityGroupMembershipsByGroupIdInOrg
  };
};
