import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TIdentities } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";
import { ProjectIdentityOrderBy, TListProjectIdentityDTO } from "@app/services/identity-project/identity-project-types";

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

  const findByProjectId = async (
    projectId: string,
    filter: { identityId?: string } & Pick<
      TListProjectIdentityDTO,
      "limit" | "offset" | "search" | "orderBy" | "orderDirection"
    > = {},
    tx?: Knex
  ) => {
    try {
      // TODO: scott - optimize, there's redundancy here with project membership and the below query
      const fetchIdentitySubquery = (tx || db.replicaNode())(TableName.Identity)
        .where((qb) => {
          if (filter.search) {
            void qb.whereILike(`${TableName.Identity}.name`, `%${filter.search}%`);
          }
        })
        .join(
          TableName.IdentityProjectMembership,
          `${TableName.IdentityProjectMembership}.identityId`,
          `${TableName.Identity}.id`
        )
        .where(`${TableName.IdentityProjectMembership}.projectId`, projectId)
        .orderBy(
          `${TableName.Identity}.${filter.orderBy ?? ProjectIdentityOrderBy.Name}`,
          filter.orderDirection ?? OrderByDirection.ASC
        )
        .select(selectAllTableCols(TableName.Identity))
        .as(TableName.Identity); // required for subqueries

      if (filter.limit) {
        void fetchIdentitySubquery.offset(filter.offset ?? 0).limit(filter.limit);
      }

      const query = (tx || db.replicaNode())(TableName.IdentityProjectMembership)
        .where(`${TableName.IdentityProjectMembership}.projectId`, projectId)
        .join(TableName.Project, `${TableName.IdentityProjectMembership}.projectId`, `${TableName.Project}.id`)
        .join<TIdentities, TIdentities>(fetchIdentitySubquery, (bd) => {
          bd.on(`${TableName.IdentityProjectMembership}.identityId`, `${TableName.Identity}.id`);
        })
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

      // TODO: scott - joins seem to reorder identities so need to order again, for the sake of urgency will optimize at a later point
      if (filter.orderBy) {
        switch (filter.orderBy) {
          case "name":
            void query.orderBy(`${TableName.Identity}.${filter.orderBy}`, filter.orderDirection);
            break;
          default:
          // do nothing
        }
      }

      const docs = await query;

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

  const getCountByProjectId = async (
    projectId: string,
    filter: { identityId?: string } & Pick<TListProjectIdentityDTO, "search"> = {},
    tx?: Knex
  ) => {
    try {
      const identities = await (tx || db.replicaNode())(TableName.IdentityProjectMembership)
        .where(`${TableName.IdentityProjectMembership}.projectId`, projectId)
        .join(TableName.Project, `${TableName.IdentityProjectMembership}.projectId`, `${TableName.Project}.id`)
        .join(TableName.Identity, `${TableName.IdentityProjectMembership}.identityId`, `${TableName.Identity}.id`)
        .where((qb) => {
          if (filter.identityId) {
            void qb.where("identityId", filter.identityId);
          }

          if (filter.search) {
            void qb.whereILike(`${TableName.Identity}.name`, `%${filter.search}%`);
          }
        })
        .count();

      return Number(identities[0].count);
    } catch (error) {
      throw new DatabaseError({ error, name: "GetCountByProjectId" });
    }
  };

  return {
    ...identityProjectOrm,
    findByIdentityId,
    findByProjectId,
    getCountByProjectId
  };
};
