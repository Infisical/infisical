import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TKmipOrgConfigDALFactory = ReturnType<typeof kmipOrgConfigDALFactory>;

export const kmipOrgConfigDALFactory = (db: TDbClient) => {
  const kmipOrgConfigOrm = ormify(db, TableName.KmipOrgConfig);

  return kmipOrgConfigOrm;
};
