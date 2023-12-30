import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName,TIdentityOrgMemberships } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TIdentityOrgDalFactory = ReturnType<typeof identityOrgDalFactory>;

export const identityOrgDalFactory = (db: TDbClient) => {
  const identityOrgOrm = ormify(db, TableName.IdentityOrgMembership);

  const findOne = async (filter: Partial<TIdentityOrgMemberships>, tx?: Knex) => {
    try {
      const [data] = await (tx || db)(TableName.IdentityOrgMembership)
        .where(filter)
        .join(
          TableName.Identity,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.Identity}.id`
        )
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

  return { ...identityOrgOrm, findOne };
};
