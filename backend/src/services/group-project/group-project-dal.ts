import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TMemberships } from "@app/db/schemas/memberships";
import { AccessScope, TableName } from "@app/db/schemas/models";
import { TUserEncryptionKeys } from "@app/db/schemas/user-encryption-keys";
import { DatabaseError } from "@app/lib/errors";
import { sqlNestRelationships } from "@app/lib/knex";

export type TGroupProjectDALFactory = ReturnType<typeof groupProjectDALFactory>;

export const groupProjectDALFactory = (db: TDbClient) => {
  const findByProjectId = async (projectId: string, filter?: { groupId?: string }, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.Membership)
        .where(`${TableName.Membership}.scopeProjectId`, projectId)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .whereNotNull(`${TableName.Membership}.actorGroupId`)
        .where((qb) => {
          if (filter?.groupId) {
            void qb.where(`${TableName.Groups}.id`, "=", filter.groupId);
          }
        })
        .join(TableName.Groups, `${TableName.Membership}.actorGroupId`, `${TableName.Groups}.id`)
        .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .select(
          db.ref("id").withSchema(TableName.Membership),
          db.ref("createdAt").withSchema(TableName.Membership),
          db.ref("updatedAt").withSchema(TableName.Membership),
          db.ref("id").as("groupId").withSchema(TableName.Groups),
          db.ref("name").as("groupName").withSchema(TableName.Groups),
          db.ref("slug").as("groupSlug").withSchema(TableName.Groups),
          db.ref("role").withSchema(TableName.MembershipRole),
          db.ref("id").withSchema(TableName.MembershipRole).as("membershipRoleId"),
          db.ref("customRoleId").withSchema(TableName.MembershipRole),
          db.ref("name").withSchema(TableName.Role).as("customRoleName"),
          db.ref("slug").withSchema(TableName.Role).as("customRoleSlug"),
          db.ref("temporaryMode").withSchema(TableName.MembershipRole),
          db.ref("isTemporary").withSchema(TableName.MembershipRole),
          db.ref("temporaryRange").withSchema(TableName.MembershipRole),
          db.ref("temporaryAccessStartTime").withSchema(TableName.MembershipRole),
          db.ref("temporaryAccessEndTime").withSchema(TableName.MembershipRole)
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

  const findByUserId = async (userId: string, orgId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.UserGroupMembership)
        .where(`${TableName.UserGroupMembership}.userId`, userId)
        .join(TableName.Groups, (qb) => {
          qb.on(`${TableName.UserGroupMembership}.groupId`, "=", `${TableName.Groups}.id`).andOn(
            `${TableName.Groups}.orgId`,
            "=",
            db.raw("?", [orgId])
          );
        })
        .select(
          db.ref("id").withSchema(TableName.Groups),
          db.ref("name").withSchema(TableName.Groups),
          db.ref("slug").withSchema(TableName.Groups),
          db.ref("orgId").withSchema(TableName.Groups)
        );

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByUserId" });
    }
  };

  // The GroupProjectMembership table has a reference to the project (projectId) AND the group (groupId).
  // We need to join the GroupProjectMembership table with the Groups table to get the group name and slug.
  // We also need to join the GroupProjectMembershipRole table to get the role of the group in the project.
  const findAllProjectGroupMembers = async (projectId: string) => {
    const docs = await db(TableName.UserGroupMembership)
      // Join the GroupProjectMembership table with the Groups table to get the group name and slug.
      .join(
        TableName.Membership,
        `${TableName.UserGroupMembership}.groupId`,
        `${TableName.Membership}.actorGroupId` // this gives us access to the project id in the group membership
      )
      .join(TableName.Project, `${TableName.Membership}.scopeProjectId`, `${TableName.Project}.id`)
      .where(`${TableName.Membership}.scopeProjectId`, projectId)
      .where(`${TableName.Membership}.scope`, AccessScope.Project)
      .join(TableName.Users, `${TableName.UserGroupMembership}.userId`, `${TableName.Users}.id`)
      .join<TUserEncryptionKeys>(
        TableName.UserEncryptionKey,
        `${TableName.UserEncryptionKey}.userId`,
        `${TableName.Users}.id`
      )
      .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
      .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
      .join<TMemberships>(db(TableName.Membership).as("orgMembership"), (qb) => {
        qb.on(`${TableName.Users}.id`, `orgMembership.actorUserId`)
          .andOn(`orgMembership.scope`, db.raw("?", [AccessScope.Organization]))
          .andOn(`orgMembership.scopeOrgId`, `${TableName.Project}.orgId`);
      })
      .select(
        db.ref("id").withSchema(TableName.UserGroupMembership),
        db.ref("createdAt").withSchema(TableName.UserGroupMembership),
        db.ref("isGhost").withSchema(TableName.Users),
        db.ref("username").withSchema(TableName.Users),
        db.ref("email").withSchema(TableName.Users),
        db.ref("publicKey").withSchema(TableName.UserEncryptionKey),
        db.ref("firstName").withSchema(TableName.Users),
        db.ref("lastName").withSchema(TableName.Users),
        db.ref("id").withSchema(TableName.Users).as("userId"),
        db.ref("role").withSchema(TableName.MembershipRole),
        db.ref("id").withSchema(TableName.MembershipRole).as("membershipRoleId"),
        db.ref("customRoleId").withSchema(TableName.MembershipRole),
        db.ref("name").withSchema(TableName.Role).as("customRoleName"),
        db.ref("slug").withSchema(TableName.Role).as("customRoleSlug"),
        db.ref("temporaryMode").withSchema(TableName.MembershipRole),
        db.ref("isTemporary").withSchema(TableName.MembershipRole),
        db.ref("temporaryRange").withSchema(TableName.MembershipRole),
        db.ref("temporaryAccessStartTime").withSchema(TableName.MembershipRole),
        db.ref("temporaryAccessEndTime").withSchema(TableName.MembershipRole),
        db.ref("name").as("projectName").withSchema(TableName.Project),
        db.ref("isActive").withSchema("orgMembership")
      )
      .where({ isGhost: false });

    const members = sqlNestRelationships({
      data: docs,
      parentMapper: ({
        email,
        firstName,
        username,
        lastName,
        publicKey,
        isGhost,
        id,
        userId,
        projectName,
        createdAt,
        isActive
      }) => ({
        isGroupMember: true,
        id,
        userId,
        projectId,
        project: {
          id: projectId,
          name: projectName
        },
        user: { email, username, firstName, lastName, id: userId, publicKey, isGhost, isOrgMembershipActive: isActive },
        createdAt
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

  return { findByProjectId, findByUserId, findAllProjectGroupMembers };
};
