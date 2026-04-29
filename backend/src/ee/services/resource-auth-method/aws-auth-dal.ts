import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TResourceAwsAuthDALFactory = ReturnType<typeof resourceAwsAuthDALFactory>;

export const resourceAwsAuthDALFactory = (db: TDbClient) => {
  return ormify(db, TableName.ResourceAwsAuth);
};
