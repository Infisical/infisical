import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TUserActivationDALFactory = ReturnType<typeof userActivationDALFactory>;

export const userActivationDALFactory = (db: TDbClient) => {
  const userActivationOrm = ormify(db, TableName.UserSecretActivation);

  // Locking read for use inside a transaction: concurrent activation checks for the same
  // (userId, orgId) serialize on the row instead of racing the read-modify-write.
  const findOneForUpdate = async (filter: { userId: string; orgId: string }, tx: Knex) => {
    try {
      return await tx(TableName.UserSecretActivation).where(filter).forUpdate().first("*");
    } catch (error) {
      throw new DatabaseError({ error, name: "FindOneForUpdate - UserActivation" });
    }
  };

  return { ...userActivationOrm, findOneForUpdate };
};
