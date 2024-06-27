import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, sqlNestRelationships } from "@app/lib/knex";

export type TGroupProjectDALFactory = ReturnType<typeof groupProjectDALFactory>;

export const groupProjectDALFactory = (db: TDbClient) => {
  const groupProjectOrm = ormify(db, TableName.GroupProjectMembership);

  const findByProjectId = async (projectId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.GroupProjectMembership)
        .where(`${TableName.GroupProjectMembership}.projectId`, projectId)
        .join(TableName.Groups, `${TableName.GroupProjectMembership}.groupId`, `${TableName.Groups}.id`)
        .join(
          TableName.GroupProjectMembershipRole,
          `${TableName.GroupProjectMembershipRole}.projectMembershipId`,
          `${TableName.GroupProjectMembership}.id`
        )
        .leftJoin(
          TableName.ProjectRoles,
          `${TableName.GroupProjectMembershipRole}.customRoleId`,
          `${TableName.ProjectRoles}.id`
        )
        .select(
          db.ref("id").withSchema(TableName.GroupProjectMembership),
          db.ref("createdAt").withSchema(TableName.GroupProjectMembership),
          db.ref("updatedAt").withSchema(TableName.GroupProjectMembership),
          db.ref("id").as("groupId").withSchema(TableName.Groups),
          db.ref("name").as("groupName").withSchema(TableName.Groups),
          db.ref("slug").as("groupSlug").withSchema(TableName.Groups),
          db.ref("id").withSchema(TableName.GroupProjectMembership),
          db.ref("role").withSchema(TableName.GroupProjectMembershipRole),
          db.ref("id").withSchema(TableName.GroupProjectMembershipRole).as("membershipRoleId"),
          db.ref("customRoleId").withSchema(TableName.GroupProjectMembershipRole),
          db.ref("name").withSchema(TableName.ProjectRoles).as("customRoleName"),
          db.ref("slug").withSchema(TableName.ProjectRoles).as("customRoleSlug"),
          db.ref("temporaryMode").withSchema(TableName.GroupProjectMembershipRole),
          db.ref("isTemporary").withSchema(TableName.GroupProjectMembershipRole),
          db.ref("temporaryRange").withSchema(TableName.GroupProjectMembershipRole),
          db.ref("temporaryAccessStartTime").withSchema(TableName.GroupProjectMembershipRole),
          db.ref("temporaryAccessEndTime").withSchema(TableName.GroupProjectMembershipRole)
        );

      const members = sqlNestRelationships({
        data: docs,
        parentMapper: ({ groupId, groupName, groupSlug, id, createdAt, updatedAt }) => ({
          id,
          groupId,
          createdAt,
          updatedAt,
          group: {
            id: groupId,
            name: groupName,
            slug: groupSlug
          }
        }),
        key: "id",
        childrenMapper: [
          {
            label: "roles" as const,
            key: "membershipRoleId",
            mapper: ({
              role,
              customRoleId,
              customRoleName,
              customRoleSlug,
              membershipRoleId,
              temporaryRange,
              temporaryMode,
              temporaryAccessEndTime,
              temporaryAccessStartTime,
              isTemporary
            }) => ({
              id: membershipRoleId,
              role,
              customRoleId,
              customRoleName,
              customRoleSlug,
              temporaryRange,
              temporaryMode,
              temporaryAccessEndTime,
              temporaryAccessStartTime,
              isTemporary
            })
          }
        ]
      });
      return members;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByProjectId" });
    }
  };

  return { ...groupProjectOrm, findByProjectId };
};
