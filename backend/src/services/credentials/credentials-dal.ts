import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TCredentialsDALFactory = ReturnType<typeof credentialsDALFactory>;

export const credentialsDALFactory = (db: TDbClient) => {
  const credentialsOrm = ormify(db, TableName.WebLogin);

  return { ...credentialsOrm };
};
