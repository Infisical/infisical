import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAdminSlackConfigDALFactory = ReturnType<typeof adminSlackConfigDALFactory>;

export const adminSlackConfigDALFactory = (db: TDbClient) => {
  const adminSlackConfigOrm = ormify(db, TableName.AdminSlackConfig);

  return adminSlackConfigOrm;
};
