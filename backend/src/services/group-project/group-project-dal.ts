import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TUserEncryptionKeys } from "@app/db/schemas";
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

  // The GroupProjectMembership table has a reference to the project (projectId) AND the group (groupId).
  // We need to join the GroupProjectMembership table with the Groups table to get the group name and slug.
  // We also need to join the GroupProjectMembershipRole table to get the role of the group in the project.
  const findAllProjectGroupMembers = async (projectId: string) => {
    const docs = await db(TableName.UserGroupMembership)
      // Join the GroupProjectMembership table with the Groups table to get the group name and slug.
      .join(
        TableName.GroupProjectMembership,
        `${TableName.UserGroupMembership}.groupId`,
        `${TableName.GroupProjectMembership}.groupId` // this gives us access to the project id in the group membership
      )

      .join(TableName.Project, `${TableName.GroupProjectMembership}.projectId`, `${TableName.Project}.id`)

      .where(`${TableName.GroupProjectMembership}.projectId`, projectId)

      .join(TableName.Users, `${TableName.UserGroupMembership}.userId`, `${TableName.Users}.id`)
      .join<TUserEncryptionKeys>(
        TableName.UserEncryptionKey,
        `${TableName.UserEncryptionKey}.userId`,
        `${TableName.Users}.id`
      )
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
        db.ref("isGhost").withSchema(TableName.Users),
        db.ref("username").withSchema(TableName.Users),
        db.ref("email").withSchema(TableName.Users),
        db.ref("publicKey").withSchema(TableName.UserEncryptionKey),
        db.ref("firstName").withSchema(TableName.Users),
        db.ref("lastName").withSchema(TableName.Users),
        db.ref("id").withSchema(TableName.Users).as("userId"),
        db.ref("role").withSchema(TableName.GroupProjectMembershipRole),
        db.ref("id").withSchema(TableName.GroupProjectMembershipRole).as("membershipRoleId"),
        db.ref("customRoleId").withSchema(TableName.GroupProjectMembershipRole),
        db.ref("name").withSchema(TableName.ProjectRoles).as("customRoleName"),
        db.ref("slug").withSchema(TableName.ProjectRoles).as("customRoleSlug"),
        db.ref("temporaryMode").withSchema(TableName.GroupProjectMembershipRole),
        db.ref("isTemporary").withSchema(TableName.GroupProjectMembershipRole),
        db.ref("temporaryRange").withSchema(TableName.GroupProjectMembershipRole),
        db.ref("temporaryAccessStartTime").withSchema(TableName.GroupProjectMembershipRole),
        db.ref("temporaryAccessEndTime").withSchema(TableName.GroupProjectMembershipRole),
        db.ref("name").as("projectName").withSchema(TableName.Project)
      )
      .where({ isGhost: false });

    const members = sqlNestRelationships({
      data: docs,
      parentMapper: ({ email, firstName, username, lastName, publicKey, isGhost, id, userId, projectName }) => ({
        isGroupMember: true,
        id,
        userId,
        projectId,
        project: {
          id: projectId,
          name: projectName
        },
        user: { email, username, firstName, lastName, id: userId, publicKey, isGhost }
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
  };

  return { ...groupProjectOrm, findByProjectId, findAllProjectGroupMembers };
};
