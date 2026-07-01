import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TMfaRecoveryCodeDALFactory = ReturnType<typeof mfaRecoveryCodeDALFactory>;

export const mfaRecoveryCodeDALFactory = (db: TDbClient) => {
  const mfaRecoveryCodeDal = ormify(db, TableName.UserMfaRecoveryCode);

  return mfaRecoveryCodeDal;
};
