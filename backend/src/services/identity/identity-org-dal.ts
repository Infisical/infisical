import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TIdentityOrgMemberships } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";
import { OrgIdentityOrderBy, TListOrgIdentitiesByOrgIdDTO } from "@app/services/identity/identity-types";

export type TIdentityOrgDALFactory = ReturnType<typeof identityOrgDALFactory>;

export const identityOrgDALFactory = (db: TDbClient) => {
  const identityOrgOrm = ormify(db, TableName.IdentityOrgMembership);

  const findOne = async (filter: Partial<TIdentityOrgMemberships>, tx?: Knex) => {
    try {
      const [data] = await (tx || db.replicaNode())(TableName.IdentityOrgMembership)
        .where(filter)
        .join(TableName.Identity, `${TableName.IdentityOrgMembership}.identityId`, `${TableName.Identity}.id`)
        .select(selectAllTableCols(TableName.IdentityOrgMembership))
        .select(db.ref("name").withSchema(TableName.Identity))
        .select(db.ref("authMethod").withSchema(TableName.Identity));
      if (data) {
        const { name, authMethod } = data;
        return { ...data, identity: { id: data.identityId, name, authMethod } };
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
      const paginatedFetchIdentity = (tx || db.replicaNode())(TableName.Identity)
        .as(TableName.Identity)
        .orderBy(`${TableName.Identity}.${orderBy}`, orderDirection);

      if (search?.length) {
        void paginatedFetchIdentity.whereILike(`${TableName.Identity}.name`, `%${search}%`);
      }

      if (limit) {
        void paginatedFetchIdentity.offset(offset).limit(limit);
      }

      const query = (tx || db.replicaNode())(TableName.IdentityOrgMembership)
        .where(filter)
        .join<Awaited<typeof paginatedFetchIdentity>>(paginatedFetchIdentity, (queryBuilder) => {
          queryBuilder.on(`${TableName.IdentityOrgMembership}.identityId`, `${TableName.Identity}.id`);
        })
        .leftJoin(TableName.OrgRoles, `${TableName.IdentityOrgMembership}.roleId`, `${TableName.OrgRoles}.id`)
        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          void queryBuilder
            .on(`${TableName.IdentityOrgMembership}.identityId`, `${TableName.IdentityMetadata}.identityId`)
            .andOn(`${TableName.IdentityOrgMembership}.orgId`, `${TableName.IdentityMetadata}.orgId`);
        })
        .select(selectAllTableCols(TableName.IdentityOrgMembership))
        // cr stands for custom role
        .select(db.ref("id").as("crId").withSchema(TableName.OrgRoles))
        .select(db.ref("name").as("crName").withSchema(TableName.OrgRoles))
        .select(db.ref("slug").as("crSlug").withSchema(TableName.OrgRoles))
        .select(db.ref("description").as("crDescription").withSchema(TableName.OrgRoles))
        .select(db.ref("permissions").as("crPermission").withSchema(TableName.OrgRoles))
        .select(db.ref("permissions").as("crPermission").withSchema(TableName.OrgRoles))
        .select(db.ref("id").as("identityId").withSchema(TableName.Identity))
        .select(
          db.ref("name").as("identityName").withSchema(TableName.Identity),
          db.ref("authMethod").as("identityAuthMethod").withSchema(TableName.Identity)
        )
        .select(
          db.ref("id").withSchema(TableName.IdentityMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.IdentityMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue")
        )
        .orderBy(`${TableName.Identity}.${orderBy}`, orderDirection);

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
          identityId,
          identityName,
          identityAuthMethod,
          role,
          roleId,
          id,
          orgId,
          createdAt,
          updatedAt
        }) => ({
          role,
          roleId,
          identityId,
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
            id: identityId,
            name: identityName,
            authMethod: identityAuthMethod as string
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
