import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TTotpConfigDALFactory = ReturnType<typeof totpConfigDALFactory>;

export const totpConfigDALFactory = (db: TDbClient) => {
  const totpConfigDal = ormify(db, TableName.TotpConfig);

  return totpConfigDal;
};
