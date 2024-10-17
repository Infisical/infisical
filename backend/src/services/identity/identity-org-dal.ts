import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  IdentityAuthMethod,
  TableName,
  TIdentityAwsAuths,
  TIdentityAzureAuths,
  TIdentityGcpAuths,
  TIdentityKubernetesAuths,
  TIdentityOidcAuths,
  TIdentityOrgMemberships,
  TIdentityTokenAuths,
  TIdentityUniversalAuths,
  TOrgRoles
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";
import { OrgIdentityOrderBy, TListOrgIdentitiesByOrgIdDTO } from "@app/services/identity/identity-types";

const buildAuthMethods = ({
  uaId,
  gcpId,
  awsId,
  kubernetesId,
  oidcId,
  azureId,
  tokenId
}: {
  uaId?: string;
  gcpId?: string;
  awsId?: string;
  kubernetesId?: string;
  oidcId?: string;
  azureId?: string;
  tokenId?: string;
}) => {
  return [
    ...(uaId ? [IdentityAuthMethod.UNIVERSAL_AUTH] : []),
    ...(gcpId ? [IdentityAuthMethod.GCP_AUTH] : []),
    ...(awsId ? [IdentityAuthMethod.AWS_AUTH] : []),
    ...(kubernetesId ? [IdentityAuthMethod.KUBERNETES_AUTH] : []),
    ...(oidcId ? [IdentityAuthMethod.OIDC_AUTH] : []),
    ...(azureId ? [IdentityAuthMethod.AZURE_AUTH] : []),
    ...(tokenId ? [IdentityAuthMethod.TOKEN_AUTH] : [])
  ].filter((authMethod) => authMethod);
};

export type TIdentityOrgDALFactory = ReturnType<typeof identityOrgDALFactory>;

export const identityOrgDALFactory = (db: TDbClient) => {
  const identityOrgOrm = ormify(db, TableName.IdentityOrgMembership);

  const findOne = async (filter: Partial<TIdentityOrgMemberships>, tx?: Knex) => {
    try {
      const [data] = await (tx || db.replicaNode())(TableName.IdentityOrgMembership)
        .where((queryBuilder) => {
          Object.entries(filter).forEach(([key, value]) => {
            void queryBuilder.where(`${TableName.IdentityOrgMembership}.${key}`, value);
          });
        })
        .join(TableName.Identity, `${TableName.IdentityOrgMembership}.identityId`, `${TableName.Identity}.id`)

        .leftJoin<TIdentityUniversalAuths>(
          TableName.IdentityUniversalAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityUniversalAuth}.identityId`
        )
        .leftJoin<TIdentityGcpAuths>(
          TableName.IdentityGcpAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityGcpAuth}.identityId`
        )
        .leftJoin<TIdentityAwsAuths>(
          TableName.IdentityAwsAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityAwsAuth}.identityId`
        )
        .leftJoin<TIdentityKubernetesAuths>(
          TableName.IdentityKubernetesAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityKubernetesAuth}.identityId`
        )
        .leftJoin<TIdentityOidcAuths>(
          TableName.IdentityOidcAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityOidcAuth}.identityId`
        )
        .leftJoin<TIdentityAzureAuths>(
          TableName.IdentityAzureAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityAzureAuth}.identityId`
        )
        .leftJoin<TIdentityTokenAuths>(
          TableName.IdentityTokenAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityTokenAuth}.identityId`
        )

        .select(
          selectAllTableCols(TableName.IdentityOrgMembership),

          db.ref("id").as("uaId").withSchema(TableName.IdentityUniversalAuth),
          db.ref("id").as("gcpId").withSchema(TableName.IdentityGcpAuth),
          db.ref("id").as("awsId").withSchema(TableName.IdentityAwsAuth),
          db.ref("id").as("kubernetesId").withSchema(TableName.IdentityKubernetesAuth),
          db.ref("id").as("oidcId").withSchema(TableName.IdentityOidcAuth),
          db.ref("id").as("azureId").withSchema(TableName.IdentityAzureAuth),
          db.ref("id").as("tokenId").withSchema(TableName.IdentityTokenAuth),

          db.ref("name").withSchema(TableName.Identity)
        );

      if (data) {
        const { name } = data;
        return {
          ...data,
          identity: {
            id: data.identityId,
            name,
            authMethods: buildAuthMethods(data)
          }
        };
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "FindOne" });
    }
  };

  const find = async (
    {
      limit,
      offset = 0,
      orderBy = OrgIdentityOrderBy.Name,
      orderDirection = OrderByDirection.ASC,
      search,
      ...filter
    }: Partial<TIdentityOrgMemberships> &
      Pick<TListOrgIdentitiesByOrgIdDTO, "offset" | "limit" | "orderBy" | "orderDirection" | "search">,
    tx?: Knex
  ) => {
    try {
      const paginatedIdentitySubquery = (tx || db.replicaNode())(TableName.Identity)
        .join(
          TableName.IdentityOrgMembership,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.Identity}.id`
        )
        .orderBy(`${TableName.Identity}.${orderBy}`, orderDirection)
        .select(
          selectAllTableCols(TableName.IdentityOrgMembership),
          db.ref("name").withSchema(TableName.Identity).as("identityName")
          // db.ref("authMethod").withSchema(TableName.Identity).as("identityAuthMethod")
        )
        .where(filter)
        .as("paginatedIdentity");

      if (search?.length) {
        void paginatedIdentitySubquery.whereILike(`${TableName.Identity}.name`, `%${search}%`);
      }

      if (limit) {
        void paginatedIdentitySubquery.offset(offset).limit(limit);
      }

      const paginatedIdentity = paginatedIdentitySubquery.as("paginatedIdentity");

      // akhilmhdh: refer this for pagination with multiple left queries
      type TSubquery = Awaited<typeof paginatedIdentity>;
      const query = (tx || db.replicaNode())
        .from<TSubquery[number], TSubquery>(paginatedIdentity)
        .leftJoin<TOrgRoles>(TableName.OrgRoles, `paginatedIdentity.roleId`, `${TableName.OrgRoles}.id`)

        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          void queryBuilder
            .on(`paginatedIdentity.identityId`, `${TableName.IdentityMetadata}.identityId`)
            .andOn(`paginatedIdentity.orgId`, `${TableName.IdentityMetadata}.orgId`);
        })

        .leftJoin<TIdentityUniversalAuths>(
          TableName.IdentityUniversalAuth,
          "paginatedIdentity.identityId",
          `${TableName.IdentityUniversalAuth}.identityId`
        )
        .leftJoin<TIdentityGcpAuths>(
          TableName.IdentityGcpAuth,
          "paginatedIdentity.identityId",
          `${TableName.IdentityGcpAuth}.identityId`
        )
        .leftJoin<TIdentityAwsAuths>(
          TableName.IdentityAwsAuth,
          "paginatedIdentity.identityId",
          `${TableName.IdentityAwsAuth}.identityId`
        )
        .leftJoin<TIdentityKubernetesAuths>(
          TableName.IdentityKubernetesAuth,
          "paginatedIdentity.identityId",
          `${TableName.IdentityKubernetesAuth}.identityId`
        )
        .leftJoin<TIdentityOidcAuths>(
          TableName.IdentityOidcAuth,
          "paginatedIdentity.identityId",
          `${TableName.IdentityOidcAuth}.identityId`
        )
        .leftJoin<TIdentityAzureAuths>(
          TableName.IdentityAzureAuth,
          "paginatedIdentity.identityId",
          `${TableName.IdentityAzureAuth}.identityId`
        )
        .leftJoin<TIdentityTokenAuths>(
          TableName.IdentityTokenAuth,
          "paginatedIdentity.identityId",
          `${TableName.IdentityTokenAuth}.identityId`
        )

        .select(
          db.ref("id").withSchema("paginatedIdentity"),
          db.ref("role").withSchema("paginatedIdentity"),
          db.ref("roleId").withSchema("paginatedIdentity"),
          db.ref("orgId").withSchema("paginatedIdentity"),
          db.ref("createdAt").withSchema("paginatedIdentity"),
          db.ref("updatedAt").withSchema("paginatedIdentity"),
          db.ref("identityId").withSchema("paginatedIdentity").as("identityNewId"),
          db.ref("identityName").withSchema("paginatedIdentity"),

          db.ref("id").as("uaId").withSchema(TableName.IdentityUniversalAuth),
          db.ref("id").as("gcpId").withSchema(TableName.IdentityGcpAuth),
          db.ref("id").as("awsId").withSchema(TableName.IdentityAwsAuth),
          db.ref("id").as("kubernetesId").withSchema(TableName.IdentityKubernetesAuth),
          db.ref("id").as("oidcId").withSchema(TableName.IdentityOidcAuth),
          db.ref("id").as("azureId").withSchema(TableName.IdentityAzureAuth),
          db.ref("id").as("tokenId").withSchema(TableName.IdentityTokenAuth)
        )
        // cr stands for custom role
        .select(db.ref("id").as("crId").withSchema(TableName.OrgRoles))
        .select(db.ref("name").as("crName").withSchema(TableName.OrgRoles))
        .select(db.ref("slug").as("crSlug").withSchema(TableName.OrgRoles))
        .select(db.ref("description").as("crDescription").withSchema(TableName.OrgRoles))
        .select(db.ref("permissions").as("crPermission").withSchema(TableName.OrgRoles))
        .select(db.ref("permissions").as("crPermission").withSchema(TableName.OrgRoles))
        .select(
          db.ref("id").withSchema(TableName.IdentityMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.IdentityMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue")
        );
      if (orderBy === OrgIdentityOrderBy.Name) {
        void query.orderBy("identityName", orderDirection);
      }

      const docs = await query;
      const formattedDocs = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: ({
          crId,
          crDescription,
          crSlug,
          crPermission,
          crName,
          identityNewId,
          identityName,
          role,
          roleId,
          id,
          orgId,
          uaId,
          awsId,
          gcpId,
          kubernetesId,
          oidcId,
          azureId,
          tokenId,
          createdAt,
          updatedAt
        }) => ({
          role,
          roleId,
          identityId: identityNewId,
          id,

          orgId,
          createdAt,
          updatedAt,
          customRole: roleId
            ? {
                id: crId,
                name: crName,
                slug: crSlug,
                permissions: crPermission,
                description: crDescription
              }
            : undefined,
          identity: {
            id: identityNewId,
            name: identityName,
            authMethods: buildAuthMethods({
              uaId,
              awsId,
              gcpId,
              kubernetesId,
              oidcId,
              azureId,
              tokenId
            })
          }
        }),
        childrenMapper: [
          {
            key: "metadataId",
            label: "metadata" as const,
            mapper: ({ metadataKey, metadataValue, metadataId }) => ({
              id: metadataId,
              key: metadataKey,
              value: metadataValue
            })
          }
        ]
      });

      return formattedDocs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByOrgId" });
    }
  };

  const countAllOrgIdentities = async (
    { search, ...filter }: Partial<TIdentityOrgMemberships> & Pick<TListOrgIdentitiesByOrgIdDTO, "search">,
    tx?: Knex
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.IdentityOrgMembership)
        .where(filter)
        .join(TableName.Identity, `${TableName.IdentityOrgMembership}.identityId`, `${TableName.Identity}.id`)
        .count();

      if (search?.length) {
        void query.whereILike(`${TableName.Identity}.name`, `%${search}%`);
      }

      const identities = await query;

      return Number(identities[0].count);
    } catch (error) {
      throw new DatabaseError({ error, name: "countAllOrgIdentities" });
    }
  };

  return { ...identityOrgOrm, find, findOne, countAllOrgIdentities };
};
