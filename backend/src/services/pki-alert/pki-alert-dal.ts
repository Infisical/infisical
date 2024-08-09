import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TPkiAlertDALFactory = ReturnType<typeof pkiAlertDALFactory>;

export const pkiAlertDALFactory = (db: TDbClient) => {
  const pkiAlertOrm = ormify(db, TableName.PkiAlert);
  return {
    ...pkiAlertOrm
  };
};
