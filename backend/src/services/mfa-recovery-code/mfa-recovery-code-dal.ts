import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TMfaRecoveryCodeDALFactory = ReturnType<typeof mfaRecoveryCodeDALFactory>;

export const mfaRecoveryCodeDALFactory = (db: TDbClient) => {
  const mfaRecoveryCodeDal = ormify(db, TableName.UserMfaRecoveryCode);

  // Locks the user's recovery-code row FOR UPDATE so a read-modify-write that
  // consumes a code is serialized against concurrent consumers.
  const findOneByUserIdForUpdate = async (userId: string, tx: Knex) => {
    try {
      const doc = await tx(TableName.UserMfaRecoveryCode).where({ userId }).forUpdate().first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one by user id for update" });
    }
  };

  return { ...mfaRecoveryCodeDal, findOneByUserIdForUpdate };
};
