import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  TableName,
  TIdentities,
  TIdentityAlicloudAuths,
  TIdentityAwsAuths,
  TIdentityAzureAuths,
  TIdentityGcpAuths,
  TIdentityKubernetesAuths,
  TIdentityOciAuths,
  TIdentityOidcAuths,
  TIdentityTokenAuths,
  TIdentityUniversalAuths
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";
import { ProjectIdentityOrderBy, TListProjectIdentityDTO } from "@app/services/identity-project/identity-project-types";

import { buildAuthMethods } from "../identity/identity-fns";

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

        .leftJoin(
          TableName.IdentityUniversalAuth,
          `${TableName.IdentityProjectMembership}.identityId`,
          `${TableName.IdentityUniversalAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityGcpAuth,
          `${TableName.IdentityProjectMembership}.identityId`,
          `${TableName.IdentityGcpAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityAliCloudAuth,
          `${TableName.IdentityProjectMembership}.identityId`,
          `${TableName.IdentityAliCloudAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityAwsAuth,
          `${TableName.IdentityProjectMembership}.identityId`,
          `${TableName.IdentityAwsAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityKubernetesAuth,
          `${TableName.IdentityProjectMembership}.identityId`,
          `${TableName.IdentityKubernetesAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityOciAuth,
          `${TableName.IdentityProjectMembership}.identityId`,
          `${TableName.IdentityOciAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityOidcAuth,
          `${TableName.IdentityProjectMembership}.identityId`,
          `${TableName.IdentityOidcAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityAzureAuth,
          `${TableName.IdentityProjectMembership}.identityId`,
          `${TableName.IdentityAzureAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityTokenAuth,
          `${TableName.IdentityProjectMembership}.identityId`,
          `${TableName.IdentityTokenAuth}.identityId`
        )

        .select(
          db.ref("id").withSchema(TableName.IdentityProjectMembership),
          db.ref("createdAt").withSchema(TableName.IdentityProjectMembership),
          db.ref("updatedAt").withSchema(TableName.IdentityProjectMembership),

          db.ref("id").as("identityId").withSchema(TableName.Identity),
          db.ref("name").as("identityName").withSchema(TableName.Identity),
          db.ref("hasDeleteProtection").withSchema(TableName.Identity),
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
          db.ref("name").as("projectName").withSchema(TableName.Project),
          db.ref("type").as("projectType").withSchema(TableName.Project),
          db.ref("id").as("uaId").withSchema(TableName.IdentityUniversalAuth),
          db.ref("id").as("gcpId").withSchema(TableName.IdentityGcpAuth),
          db.ref("id").as("alicloudId").withSchema(TableName.IdentityAliCloudAuth),
          db.ref("id").as("awsId").withSchema(TableName.IdentityAwsAuth),
          db.ref("id").as("kubernetesId").withSchema(TableName.IdentityKubernetesAuth),
          db.ref("id").as("ociId").withSchema(TableName.IdentityOciAuth),
          db.ref("id").as("oidcId").withSchema(TableName.IdentityOidcAuth),
          db.ref("id").as("azureId").withSchema(TableName.IdentityAzureAuth),
          db.ref("id").as("tokenId").withSchema(TableName.IdentityTokenAuth)
        );

      const members = sqlNestRelationships({
        data: docs,
        parentMapper: ({
          identityName,
          hasDeleteProtection,
          uaId,
          awsId,
          gcpId,
          kubernetesId,
          oidcId,
          azureId,
          tokenId,
          id,
          createdAt,
          updatedAt,
          projectId,
          projectName,
          projectType
        }) => ({
          id,
          identityId,
          createdAt,
          updatedAt,
          identity: {
            id: identityId,
            name: identityName,
            hasDeleteProtection,
            authMethods: buildAuthMethods({
              uaId,
              awsId,
              gcpId,
              kubernetesId,
              oidcId,
              azureId,
              tokenId
            })
          },
          project: {
            id: projectId,
            name: projectName,
            type: projectType
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
            void qb.where(`${TableName.IdentityProjectMembership}.identityId`, filter.identityId);
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

        .leftJoin<TIdentityUniversalAuths>(
          TableName.IdentityUniversalAuth,
          `${TableName.Identity}.id`,
          `${TableName.IdentityUniversalAuth}.identityId`
        )
        .leftJoin<TIdentityGcpAuths>(
          TableName.IdentityGcpAuth,
          `${TableName.Identity}.id`,
          `${TableName.IdentityGcpAuth}.identityId`
        )
        .leftJoin<TIdentityAlicloudAuths>(
          TableName.IdentityAliCloudAuth,
          `${TableName.Identity}.id`,
          `${TableName.IdentityAliCloudAuth}.identityId`
        )
        .leftJoin<TIdentityAwsAuths>(
          TableName.IdentityAwsAuth,
          `${TableName.Identity}.id`,
          `${TableName.IdentityAwsAuth}.identityId`
        )
        .leftJoin<TIdentityKubernetesAuths>(
          TableName.IdentityKubernetesAuth,
          `${TableName.Identity}.id`,
          `${TableName.IdentityKubernetesAuth}.identityId`
        )
        .leftJoin<TIdentityOciAuths>(
          TableName.IdentityOciAuth,
          `${TableName.Identity}.id`,
          `${TableName.IdentityOciAuth}.identityId`
        )
        .leftJoin<TIdentityOidcAuths>(
          TableName.IdentityOidcAuth,
          `${TableName.Identity}.id`,
          `${TableName.IdentityOidcAuth}.identityId`
        )
        .leftJoin<TIdentityAzureAuths>(
          TableName.IdentityAzureAuth,
          `${TableName.Identity}.id`,
          `${TableName.IdentityAzureAuth}.identityId`
        )
        .leftJoin<TIdentityTokenAuths>(
          TableName.IdentityTokenAuth,
          `${TableName.Identity}.id`,
          `${TableName.IdentityTokenAuth}.identityId`
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
          db.ref("name").as("projectName").withSchema(TableName.Project),
          db.ref("id").as("uaId").withSchema(TableName.IdentityUniversalAuth),
          db.ref("id").as("gcpId").withSchema(TableName.IdentityGcpAuth),
          db.ref("id").as("alicloudId").withSchema(TableName.IdentityAliCloudAuth),
          db.ref("id").as("awsId").withSchema(TableName.IdentityAwsAuth),
          db.ref("id").as("kubernetesId").withSchema(TableName.IdentityKubernetesAuth),
          db.ref("id").as("ociId").withSchema(TableName.IdentityOciAuth),
          db.ref("id").as("oidcId").withSchema(TableName.IdentityOidcAuth),
          db.ref("id").as("azureId").withSchema(TableName.IdentityAzureAuth),
          db.ref("id").as("tokenId").withSchema(TableName.IdentityTokenAuth)
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
        parentMapper: ({
          identityId,
          identityName,
          uaId,
          alicloudId,
          awsId,
          gcpId,
          kubernetesId,
          ociId,
          oidcId,
          azureId,
          tokenId,
          id,
          createdAt,
          updatedAt,
          projectName
        }) => ({
          id,
          identityId,
          createdAt,
          updatedAt,
          identity: {
            id: identityId,
            name: identityName,
            authMethods: buildAuthMethods({
              uaId,
              alicloudId,
              awsId,
              gcpId,
              kubernetesId,
              ociId,
              oidcId,
              azureId,
              tokenId
            })
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

      return members.map((el) => ({
        ...el,
        roles: el.roles.sort((a, b) => {
          const roleA = (a.customRoleName || a.role).toLowerCase();
          const roleB = (b.customRoleName || b.role).toLowerCase();
          return roleA.localeCompare(roleB);
        })
      }));
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
