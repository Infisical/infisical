import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TIdentityOrgMemberships } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TIdentityOrgDALFactory = ReturnType<typeof identityOrgDALFactory>;

export const identityOrgDALFactory = (db: TDbClient) => {
  const identityOrgOrm = ormify(db, TableName.IdentityOrgMembership);

  const findOne = async (filter: Partial<TIdentityOrgMemberships>, tx?: Knex) => {
    try {
      const [data] = await (tx || db)(TableName.IdentityOrgMembership)
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

  const find = async (filter: Partial<TIdentityOrgMemberships>, tx?: Knex) => {
    try {
      const docs = await (tx || db)(TableName.IdentityOrgMembership)
        .where(filter)
        .join(TableName.Identity, `${TableName.IdentityOrgMembership}.identityId`, `${TableName.Identity}.id`)
        .leftJoin(TableName.OrgRoles, `${TableName.IdentityOrgMembership}.roleId`, `${TableName.OrgRoles}.id`)
        .select(selectAllTableCols(TableName.IdentityOrgMembership))
        // cr stands for custom role
        .select(db.ref("id").as("crId").withSchema(TableName.OrgRoles))
        .select(db.ref("name").as("crName").withSchema(TableName.OrgRoles))
        .select(db.ref("slug").as("crSlug").withSchema(TableName.OrgRoles))
        .select(db.ref("description").as("crDescription").withSchema(TableName.OrgRoles))
        .select(db.ref("permissions").as("crPermission").withSchema(TableName.OrgRoles))
        .select(db.ref("permissions").as("crPermission").withSchema(TableName.OrgRoles))
        .select(db.ref("id").as("identityId").withSchema(TableName.Identity))
        .select(db.ref("name").as("identityName").withSchema(TableName.Identity))
        .select(db.ref("authMethod").as("identityAuthMethod").withSchema(TableName.Identity));
      return docs.map(
        ({
          crId,
          crDescription,
          crSlug,
          crPermission,
          crName,
          identityId,
          identityName,
          identityAuthMethod,
          ...el
        }) => ({
          ...el,
          identityId,
          identity: {
            id: identityId,
            name: identityName,
            authMethod: identityAuthMethod
          },
          customRole: el.roleId
            ? {
                id: crId,
                name: crName,
                slug: crSlug,
                permissions: crPermission,
                description: crDescription
              }
            : undefined
        })
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByOrgId" });
    }
  };

  return { ...identityOrgOrm, find, findOne };
};
