import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TResourceGcpAuthDALFactory = ReturnType<typeof resourceGcpAuthDALFactory>;

export const resourceGcpAuthDALFactory = (db: TDbClient) => {
  return ormify(db, TableName.ResourceGcpAuth);
};
