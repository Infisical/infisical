import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TUsers } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TServiceTokenDALFactory = ReturnType<typeof serviceTokenDALFactory>;

export const serviceTokenDALFactory = (db: TDbClient) => {
  const stOrm = ormify(db, TableName.ServiceToken);

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.ServiceToken)
        .leftJoin<TUsers>(
          TableName.Users,
          `${TableName.Users}.id`,
          db.raw(`${TableName.ServiceToken}."createdBy"::uuid`)
        )
        .where(`${TableName.ServiceToken}.id`, id)
        .select(selectAllTableCols(TableName.ServiceToken))
        .select(db.ref("email").withSchema(TableName.Users).as("createdByEmail"))
        .first();
      return doc;
    } catch (err) {
      throw new DatabaseError({ error: err, name: "FindById" });
    }
  };

  return { ...stOrm, findById };
};
