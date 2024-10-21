import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TIdentityOrgMemberships, TOrgRoles } from "@app/db/schemas";
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
      const paginatedIdentity = (tx || db.replicaNode())(TableName.Identity)
        .join(
          TableName.IdentityOrgMembership,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.Identity}.id`
        )
        .orderBy(`${TableName.Identity}.${orderBy}`, orderDirection)
        .select(
          selectAllTableCols(TableName.IdentityOrgMembership),
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("authMethod").withSchema(TableName.Identity).as("identityAuthMethod")
        )
        .where(filter)
        .as("paginatedIdentity");

      if (search?.length) {
        void paginatedIdentity.whereILike(`${TableName.Identity}.name`, `%${search}%`);
      }

      if (limit) {
        void paginatedIdentity.offset(offset).limit(limit);
      }

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
        .select(
          db.ref("id").withSchema("paginatedIdentity"),
          db.ref("role").withSchema("paginatedIdentity"),
          db.ref("roleId").withSchema("paginatedIdentity"),
          db.ref("orgId").withSchema("paginatedIdentity"),
          db.ref("createdAt").withSchema("paginatedIdentity"),
          db.ref("updatedAt").withSchema("paginatedIdentity"),
          db.ref("identityId").withSchema("paginatedIdentity"),
          db.ref("identityName").withSchema("paginatedIdentity"),
          db.ref("identityAuthMethod").withSchema("paginatedIdentity")
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
