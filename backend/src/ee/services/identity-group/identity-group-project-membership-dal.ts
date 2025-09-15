import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, sqlNestRelationships } from "@app/lib/knex";

export type TIdentityGroupProjectDALFactory = ReturnType<typeof identityGroupProjectDALFactory>;

export const identityGroupProjectDALFactory = (db: TDbClient) => {
  const identityGroupProjectOrm = ormify(db, TableName.IdentityGroupProjectMembership);

  const findByProjectId = async (projectId: string, filter?: { groupId?: string }, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.IdentityGroupProjectMembership)
        .where(`${TableName.IdentityGroupProjectMembership}.projectId`, projectId)
        .where((qb) => {
          if (filter?.groupId) {
            void qb.where(`${TableName.IdentityGroups}.id`, "=", filter.groupId);
          }
        })
        .join(
          TableName.IdentityGroups,
          `${TableName.IdentityGroupProjectMembership}.groupId`,
          `${TableName.IdentityGroups}.id`
        )
        .join(
          TableName.IdentityGroupProjectMembershipRole,
          `${TableName.IdentityGroupProjectMembershipRole}.projectMembershipId`,
          `${TableName.IdentityGroupProjectMembership}.id`
        )
        .leftJoin(
          TableName.ProjectRoles,
          `${TableName.IdentityGroupProjectMembershipRole}.customRoleId`,
          `${TableName.ProjectRoles}.id`
        )
        .select(
          db.ref("id").withSchema(TableName.IdentityGroupProjectMembership),
          db.ref("createdAt").withSchema(TableName.IdentityGroupProjectMembership),
          db.ref("updatedAt").withSchema(TableName.IdentityGroupProjectMembership),
          db.ref("id").as("groupId").withSchema(TableName.IdentityGroups),
          db.ref("name").as("groupName").withSchema(TableName.IdentityGroups),
          db.ref("slug").as("groupSlug").withSchema(TableName.IdentityGroups),
          db.ref("id").withSchema(TableName.IdentityGroupProjectMembership),
          db.ref("role").withSchema(TableName.IdentityGroupProjectMembershipRole),
          db.ref("id").withSchema(TableName.IdentityGroupProjectMembershipRole).as("membershipRoleId"),
          db.ref("customRoleId").withSchema(TableName.IdentityGroupProjectMembershipRole),
          db.ref("name").withSchema(TableName.ProjectRoles).as("customRoleName"),
          db.ref("slug").withSchema(TableName.ProjectRoles).as("customRoleSlug"),
          db.ref("temporaryMode").withSchema(TableName.IdentityGroupProjectMembershipRole),
          db.ref("isTemporary").withSchema(TableName.IdentityGroupProjectMembershipRole),
          db.ref("temporaryRange").withSchema(TableName.IdentityGroupProjectMembershipRole),
          db.ref("temporaryAccessStartTime").withSchema(TableName.IdentityGroupProjectMembershipRole),
          db.ref("temporaryAccessEndTime").withSchema(TableName.IdentityGroupProjectMembershipRole)
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

  const findByIdentityId = async (identityId: string, orgId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.IdentityGroupMembership)
        .where(`${TableName.IdentityGroupMembership}.identityId`, identityId)
        .join(TableName.IdentityGroups, function () {
          this.on(`${TableName.IdentityGroupMembership}.groupId`, "=", `${TableName.IdentityGroups}.id`).andOn(
            `${TableName.IdentityGroups}.orgId`,
            "=",
            db.raw("?", [orgId])
          );
        })
        .select(
          db.ref("id").withSchema(TableName.IdentityGroups),
          db.ref("name").withSchema(TableName.IdentityGroups),
          db.ref("slug").withSchema(TableName.IdentityGroups),
          db.ref("orgId").withSchema(TableName.IdentityGroups)
        );

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByIdentityId" });
    }
  };

  // The IdentityGroupProjectMembership table has a reference to the project (projectId) AND the group (groupId).
  // We need to join the IdentityGroupProjectMembership table with the IdentityGroups table to get the group name and slug.
  // We also need to join the IdentityGroupProjectMembershipRole table to get the role of the group in the project.
  const findAllProjectIdentityGroupMembers = async (projectId: string) => {
    const docs = await db(TableName.IdentityGroupMembership)
      // Join the IdentityGroupProjectMembership table with the IdentityGroups table to get the group name and slug.
      .join(
        TableName.IdentityGroupProjectMembership,
        `${TableName.IdentityGroupMembership}.groupId`,
        `${TableName.IdentityGroupProjectMembership}.groupId` // this gives us access to the project id in the group membership
      )

      .join(TableName.Project, `${TableName.IdentityGroupProjectMembership}.projectId`, `${TableName.Project}.id`)

      .where(`${TableName.IdentityGroupProjectMembership}.projectId`, projectId)

      .join(TableName.Identity, `${TableName.IdentityGroupMembership}.identityId`, `${TableName.Identity}.id`)
      .join(
        TableName.IdentityGroupProjectMembershipRole,
        `${TableName.IdentityGroupProjectMembershipRole}.projectMembershipId`,
        `${TableName.IdentityGroupProjectMembership}.id`
      )
      .leftJoin(
        TableName.ProjectRoles,
        `${TableName.IdentityGroupProjectMembershipRole}.customRoleId`,
        `${TableName.ProjectRoles}.id`
      )
      .join(
        TableName.IdentityOrgMembership,
        `${TableName.Identity}.id`,
        `${TableName.IdentityOrgMembership}.identityId`
      )
      .select(
        db.ref("id").withSchema(TableName.IdentityGroupMembership),
        db.ref("createdAt").withSchema(TableName.IdentityGroupMembership),
        db.ref("name").withSchema(TableName.Identity),
        db.ref("authMethod").withSchema(TableName.Identity),
        db.ref("id").withSchema(TableName.Identity).as("identityId"),
        db.ref("role").withSchema(TableName.IdentityGroupProjectMembershipRole),
        db.ref("id").withSchema(TableName.IdentityGroupProjectMembershipRole).as("membershipRoleId"),
        db.ref("customRoleId").withSchema(TableName.IdentityGroupProjectMembershipRole),
        db.ref("name").withSchema(TableName.ProjectRoles).as("customRoleName"),
        db.ref("slug").withSchema(TableName.ProjectRoles).as("customRoleSlug"),
        db.ref("temporaryMode").withSchema(TableName.IdentityGroupProjectMembershipRole),
        db.ref("isTemporary").withSchema(TableName.IdentityGroupProjectMembershipRole),
        db.ref("temporaryRange").withSchema(TableName.IdentityGroupProjectMembershipRole),
        db.ref("temporaryAccessStartTime").withSchema(TableName.IdentityGroupProjectMembershipRole),
        db.ref("temporaryAccessEndTime").withSchema(TableName.IdentityGroupProjectMembershipRole),
        db.ref("name").as("projectName").withSchema(TableName.Project)
      );

    const members = sqlNestRelationships({
      data: docs,
      parentMapper: ({ name, authMethod, id, identityId, projectName, createdAt }) => ({
        isGroupMember: true,
        id,
        identityId,
        projectId,
        project: {
          id: projectId,
          name: projectName
        },
        identity: { name, authMethod, id: identityId },
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

  return { ...identityGroupProjectOrm, findByProjectId, findByIdentityId, findAllProjectIdentityGroupMembers };
};
