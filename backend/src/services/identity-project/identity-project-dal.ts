import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, sqlNestRelationships } from "@app/lib/knex";

export type TIdentityProjectDALFactory = ReturnType<typeof identityProjectDALFactory>;

export const identityProjectDALFactory = (db: TDbClient) => {
  const identityProjectOrm = ormify(db, TableName.IdentityProjectMembership);

  const findByIdentityId = async (identityId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.IdentityProjectMembership)
        .where(`${TableName.IdentityProjectMembership}.identityId`, identityId)
        .join(TableName.Project, `${TableName.IdentityProjectMembership}.projectId`, `${TableName.Project}.id`)
        .join(TableName.Identity, `${TableName.IdentityProjectMembership}.identityId`, `${TableName.Identity}.id`)
        .join(
          TableName.IdentityProjectMembershipRole,
          `${TableName.IdentityProjectMembershipRole}.projectMembershipId`,
          `${TableName.IdentityProjectMembership}.id`
        )
        .leftJoin(
          TableName.ProjectRoles,
          `${TableName.IdentityProjectMembershipRole}.customRoleId`,
          `${TableName.ProjectRoles}.id`
        )
        .leftJoin(
          TableName.IdentityProjectAdditionalPrivilege,
          `${TableName.IdentityProjectMembership}.id`,
          `${TableName.IdentityProjectAdditionalPrivilege}.projectMembershipId`
        )
        .select(
          db.ref("id").withSchema(TableName.IdentityProjectMembership),
          db.ref("createdAt").withSchema(TableName.IdentityProjectMembership),
          db.ref("updatedAt").withSchema(TableName.IdentityProjectMembership),
          db.ref("authMethod").as("identityAuthMethod").withSchema(TableName.Identity),
          db.ref("id").as("identityId").withSchema(TableName.Identity),
          db.ref("name").as("identityName").withSchema(TableName.Identity),
          db.ref("id").withSchema(TableName.IdentityProjectMembership),
          db.ref("role").withSchema(TableName.IdentityProjectMembershipRole),
          db.ref("id").withSchema(TableName.IdentityProjectMembershipRole).as("membershipRoleId"),
          db.ref("customRoleId").withSchema(TableName.IdentityProjectMembershipRole),
          db.ref("name").withSchema(TableName.ProjectRoles).as("customRoleName"),
          db.ref("slug").withSchema(TableName.ProjectRoles).as("customRoleSlug"),
          db.ref("temporaryMode").withSchema(TableName.IdentityProjectMembershipRole),
          db.ref("isTemporary").withSchema(TableName.IdentityProjectMembershipRole),
          db.ref("temporaryRange").withSchema(TableName.IdentityProjectMembershipRole),
          db.ref("temporaryAccessStartTime").withSchema(TableName.IdentityProjectMembershipRole),
          db.ref("temporaryAccessEndTime").withSchema(TableName.IdentityProjectMembershipRole),
          db.ref("projectId").withSchema(TableName.IdentityProjectMembership),
          db.ref("name").as("projectName").withSchema(TableName.Project)
        );

      const members = sqlNestRelationships({
        data: docs,
        parentMapper: ({ identityName, identityAuthMethod, id, createdAt, updatedAt, projectId, projectName }) => ({
          id,
          identityId,
          createdAt,
          updatedAt,
          identity: {
            id: identityId,
            name: identityName,
            authMethod: identityAuthMethod
          },
          project: {
            id: projectId,
            name: projectName
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
      throw new DatabaseError({ error, name: "FindByIdentityId" });
    }
  };

  const findByProjectId = async (projectId: string, filter: { identityId?: string } = {}, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.IdentityProjectMembership)
        .where(`${TableName.IdentityProjectMembership}.projectId`, projectId)
        .join(TableName.Project, `${TableName.IdentityProjectMembership}.projectId`, `${TableName.Project}.id`)
        .join(TableName.Identity, `${TableName.IdentityProjectMembership}.identityId`, `${TableName.Identity}.id`)
        .where((qb) => {
          if (filter.identityId) {
            void qb.where("identityId", filter.identityId);
          }
        })
        .join(
          TableName.IdentityProjectMembershipRole,
          `${TableName.IdentityProjectMembershipRole}.projectMembershipId`,
          `${TableName.IdentityProjectMembership}.id`
        )
        .leftJoin(
          TableName.ProjectRoles,
          `${TableName.IdentityProjectMembershipRole}.customRoleId`,
          `${TableName.ProjectRoles}.id`
        )
        .leftJoin(
          TableName.IdentityProjectAdditionalPrivilege,
          `${TableName.IdentityProjectMembership}.id`,
          `${TableName.IdentityProjectAdditionalPrivilege}.projectMembershipId`
        )
        .select(
          db.ref("id").withSchema(TableName.IdentityProjectMembership),
          db.ref("createdAt").withSchema(TableName.IdentityProjectMembership),
          db.ref("updatedAt").withSchema(TableName.IdentityProjectMembership),
          db.ref("authMethod").as("identityAuthMethod").withSchema(TableName.Identity),
          db.ref("id").as("identityId").withSchema(TableName.Identity),
          db.ref("name").as("identityName").withSchema(TableName.Identity),
          db.ref("id").withSchema(TableName.IdentityProjectMembership),
          db.ref("role").withSchema(TableName.IdentityProjectMembershipRole),
          db.ref("id").withSchema(TableName.IdentityProjectMembershipRole).as("membershipRoleId"),
          db.ref("customRoleId").withSchema(TableName.IdentityProjectMembershipRole),
          db.ref("name").withSchema(TableName.ProjectRoles).as("customRoleName"),
          db.ref("slug").withSchema(TableName.ProjectRoles).as("customRoleSlug"),
          db.ref("temporaryMode").withSchema(TableName.IdentityProjectMembershipRole),
          db.ref("isTemporary").withSchema(TableName.IdentityProjectMembershipRole),
          db.ref("temporaryRange").withSchema(TableName.IdentityProjectMembershipRole),
          db.ref("temporaryAccessStartTime").withSchema(TableName.IdentityProjectMembershipRole),
          db.ref("temporaryAccessEndTime").withSchema(TableName.IdentityProjectMembershipRole),
          db.ref("name").as("projectName").withSchema(TableName.Project)
        );

      const members = sqlNestRelationships({
        data: docs,
        parentMapper: ({ identityId, identityName, identityAuthMethod, id, createdAt, updatedAt, projectName }) => ({
          id,
          identityId,
          createdAt,
          updatedAt,
          identity: {
            id: identityId,
            name: identityName,
            authMethod: identityAuthMethod
          },
          project: {
            id: projectId,
            name: projectName
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

  return {
    ...identityProjectOrm,
    findByIdentityId,
    findByProjectId
  };
};
