import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAlertDALFactory = ReturnType<typeof alertDALFactory>;

export const alertDALFactory = (db: TDbClient) => {
  const alertOrm = ormify(db, TableName.Alert);
  return {
    ...alertOrm
  };
};
