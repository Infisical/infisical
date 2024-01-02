import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { Knex } from "knex";

export type TSarSecretDalFactory = ReturnType<typeof sarSecretDalFactory>;

export const sarSecretDalFactory = (db: TDbClient) => {
  const sarSecretOrm = ormify(db, TableName.SarSecret);

  const findByRequestId = (requestId: string, tx?: Knex) => {
    try {
      const doc = (tx || db)(TableName.SarSecret)
        .where({ requestId })
        .leftJoin(TableName.Secret, `${TableName.SarSecret}.secretId`, `${TableName.Secret}.id`)
        .select(selectAllTableCols(TableName.SarSecret))
        .select(
          db.ref("secretBlindIndex").withSchema(TableName.Secret).as("latestSecretBlindIndex"),
          db.ref("version").withSchema(TableName.Secret).as("latestSecretVersion")
        );
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByRequestId" });
    }
  };
  return { ...sarSecretOrm, findByRequestId };
};
